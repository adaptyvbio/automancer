import asyncio
import copy
from dataclasses import KW_ONLY, dataclass, field
from typing import Any, Callable, Optional

from .devices.claim import ClaimSymbol
from .fiber.eval import EvalStack
from .units.base import BaseRunner
from .fiber.parser import BlockState
from .error import Error
from .util.misc import Exportable


@dataclass
class StateEvent:
  location: Optional[Exportable] = None
  _: KW_ONLY
  errors: list[Error] = field(default_factory=list)
  settled: bool = False
  time: Optional[float] = None


class StateProtocolError(Error):
  def __init__(self, message: str):
    super().__init__(message)


@dataclass(kw_only=True)
class StateLocationUnitEntry:
  location: Exportable
  settled: bool

  def export(self):
    return {
      "location": self.location.export(),
      "settled": self.settled
    }

@dataclass
class StateLocation:
  entries: dict[str, StateLocationUnitEntry]

  def export(self):
    return {
      namespace: entry.export() for namespace, entry in self.entries.items()
    }

@dataclass(kw_only=True)
class StateRecord:
  errors: list[Error]
  location: StateLocation


StateInstanceNotifyCallback = Callable[[StateEvent], None]
# StateInstanceCollectionResult = tuple[list[Error], StateLocation]

class StateInstanceCollection:
  def __init__(self, state: BlockState, *, notify: Callable[[StateRecord], None], runners: dict[str, BaseRunner], stack: EvalStack, symbol: ClaimSymbol):
    self._applied = False
    self._notify = notify
    self._runners = runners
    self._location: StateLocation
    self._settled_future: asyncio.Future[None]
    self._state = state

    self._instances = {
      namespace: runner.StateInstance(
        state[namespace],
        runner,
        notify=(lambda event, namespace = namespace: self._handle_event(namespace, event, notify=True)),
        stack=stack,
        symbol=symbol
      ) for namespace, runner in runners.items() if runner.StateInstance
    }

  @property
  def applied(self):
    return self._applied

  async def settled(self):
    await self._settled_future

  def _check_all_settled(self):
    if all(entry.settled for entry in self._location.entries.values()):
      self._settled_future.set_result(None)

  def _handle_event(self, namespace: str, event: StateEvent, *, notify: bool):
    entry = self._location.entries[namespace]
    entry.settled = entry.settled or event.settled

    if event.location:
      entry.location = event.location

    if notify:
      self._notify(StateRecord(
        errors=event.errors,
        location=copy.deepcopy(self._location)
      ))

  def apply(self, *, resume: bool):
    self._applied = True
    self._location = StateLocation({})
    self._settled_future = asyncio.Future()

    errors = list[Error]()

    for namespace, instance in self._instances.items():
      event = instance.apply(resume=resume)
      assert event.location

      errors += event.errors

      self._location.entries[namespace] = StateLocationUnitEntry(
        location=event.location,
        settled=event.settled
      )

    self._check_all_settled()

    return StateRecord(
      errors=errors,
      location=copy.deepcopy(self._location)
    )

  async def close(self):
    await asyncio.gather(*[instance.close() for instance in self._instances.values()])

  def prepare(self, *, resume: bool):
    for instance in self._instances.values():
      instance.prepare(resume=resume)

  async def suspend(self):
    assert self._applied

    events = await asyncio.gather(*[instance.suspend() for instance in self._instances.values()])
    errors = list[Error]()

    for namespace, event in zip(self._instances.keys(), events):
      if event:
        errors += event.errors
        self._handle_event(namespace, event, notify=False)

    record = StateRecord(
      errors=errors,
      location=copy.deepcopy(self._location)
    )

    del self._location
    del self._settled_future

    self._applied = False

    return record

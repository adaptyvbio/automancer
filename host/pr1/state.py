import asyncio
from dataclasses import KW_ONLY, dataclass, field
from typing import Any, Callable, Optional

from .devices.claim import ClaimSymbol
from .fiber.eval import EvalStack
from .units.base import BaseRunner
from .fiber.parser import BlockState
from .error import Error
from .util.misc import Exportable


@dataclass
class StateBaseEvent:
  location: Optional[Exportable] = None
  _: KW_ONLY
  errors: list[Error] = field(default_factory=list)
  time: Optional[float] = None

# @dataclass(kw_only=True)
# class StateErrorEvent(StateBaseEvent):
#   error: Optional[Error]

@dataclass
class StateSettleEvent(StateBaseEvent):
  pass

@dataclass
class StateSuspensionEvent(StateBaseEvent):
  pass

@dataclass
class StateUpdateEvent(StateBaseEvent):
  pass


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


StateInstanceNotifyCallback = Callable[[StateBaseEvent], None]
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
        notify=(lambda event, namespace = namespace: self._notify_unit(namespace, event)),
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

  def _notify_unit(self, namespace: str, event: StateBaseEvent):
    entry = self._location.entries[namespace]
    entry.settled = entry.settled or isinstance(event, StateSettleEvent)

    if event.location:
      entry.location = event.location

    self._notify(StateRecord(
      errors=event.errors,
      location=self._location
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
      settled = isinstance(event, StateSettleEvent)

      self._location.entries[namespace] = StateLocationUnitEntry(
        location=event.location,
        settled=settled
      )

    self._check_all_settled()
    return StateRecord(
      errors=errors,
      location=self._location
    )

  async def close(self):
    await asyncio.gather(*[instance.close() for instance in self._instances.values()])

  def prepare(self, *, resume: bool):
    for instance in self._instances.values():
      instance.prepare(resume=resume)

  async def suspend(self):
    assert self._applied

    self._applied = False
    await asyncio.gather(*[instance.suspend() for instance in self._instances.values()])

    del self._location
    del self._settled_future

import asyncio
import copy
from dataclasses import KW_ONLY, dataclass, field
import itertools
from typing import TYPE_CHECKING, Any, Callable, Optional, Protocol

from .devices.claim import ClaimSymbol
from .fiber.eval import EvalStack
from .units.base import BaseRunner
from .fiber.parser import BlockState, BlockUnitState
from .error import Error
from .util.misc import Exportable

if TYPE_CHECKING:
  from .fiber.master2 import ProgramHandle


@dataclass
class StateEvent:
  location: Optional[Exportable] = None
  _: KW_ONLY
  errors: list[Error] = field(default_factory=list)
  failure: bool = False
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
  settled: bool


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

  @property
  def settled(self):
    return all(entry.settled for entry in self._location.entries.values())

  def _handle_event(self, namespace: str, event: StateEvent, *, notify: bool):
    entry = self._location.entries[namespace]
    entry.settled = entry.settled or event.settled

    if event.location:
      entry.location = event.location

    if notify:
      self._notify(StateRecord(
        errors=event.errors,
        location=copy.deepcopy(self._location),
        settled=self.settled
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

    return StateRecord(
      errors=errors,
      location=copy.deepcopy(self._location),
      settled=self.settled
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
      location=copy.deepcopy(self._location),
      settled=self.settled
    )

    del self._location
    del self._settled_future

    self._applied = False

    return record


# class StateGraphNode(GraphNode):
#   def __init__(self, state: Optional[BlockState], *, applied: bool = False):
#     super().__init__()

#     self.applied: bool = applied
#     self.state = state


@dataclass(kw_only=True)
class StateProgramItem:
  applied: bool = False
  handle: 'ProgramHandle'
  location: StateLocation
  settled: bool = False
  settle_future: Optional[asyncio.Future[None]] = None
  state: Optional[BlockState] = None
  update: Callable

  def __hash__(self):
    return id(self)

class UnitStateInstance(Protocol):
  def __init__(self, *, notify: Callable[[StateEvent], None], stack: EvalStack):
    ...

  def apply(self, *, resume: bool) -> StateEvent:
    ...

  async def close(self):
    ...

  async def suspend(self) -> Optional[StateEvent]:
    ...

class UnitStateManager(Protocol):
  def add(self, item: StateProgramItem, state: BlockUnitState, *, notify: Callable[[StateEvent], None], stack: EvalStack):
    ...

  async def remove(self, item: StateProgramItem):
    ...

  def apply(self, item: StateProgramItem, items: 'dict[ProgramHandle, StateProgramItem]') -> dict[StateProgramItem, StateEvent]:
    ...

  async def suspend(self, item: StateProgramItem) -> Optional[StateEvent]:
    ...

UnitStateConsumer = type[UnitStateInstance] | UnitStateManager


class UnitStateInstanceManager(UnitStateManager):
  def __init__(self, Instance: type[UnitStateInstance], /):
    self._Instance = Instance
    self._instances = dict[StateProgramItem, UnitStateInstance]()

  def add(self, item, state, *, notify, stack):
    self._instances[item] = self._Instance(notify=notify, stack=stack)

  async def remove(self, item):
    await self._instances[item].close()
    del self._instances[item]

  def apply(self, item, items):
    from .fiber.master2 import ProgramHandle

    events = dict[StateProgramItem, StateEvent]()
    current_handle = item.handle

    while isinstance(current_handle, ProgramHandle):
      current_item = items.get(current_handle)

      if current_item:
        if current_item.applied:
          break

        events[current_item] = self._instances[current_item].apply(resume=item.applied)

      current_handle = current_handle._parent

    return events

  async def suspend(self, item):
    return await self._instances[item].suspend()


class GlobalStateManager:
  def __init__(self, consumers: dict[str, UnitStateConsumer]):
    self._consumers: dict[str, UnitStateManager] = { namespace: (UnitStateInstanceManager(consumer) if isinstance(consumer, type) else consumer) for namespace, consumer in consumers.items() }
    self._items = dict['ProgramHandle', StateProgramItem]()

  def _handle_event(self, item: StateProgramItem, namespace: str, event: StateEvent, *, skip_update: bool = False):
    entry = item.location.entries[namespace]
    entry.settled = entry.settled or event.settled

    was_settled = item.settled
    item.settled = all(entry.settled for entry in item.location.entries.values())

    change = (not was_settled) and item.settled

    if change and item.settle_future:
      item.settle_future.set_result(None)
      item.settle_future = None

    if event.location:
      entry.location = event.location

    item.update(StateRecord(
      errors=event.errors,
      location=copy.deepcopy(item.location),
      settled=item.settled
    ), update=((not change) and (not skip_update)))

  def add(self, handle: 'ProgramHandle', state: BlockState, *, stack: EvalStack, update: Callable):
    item = StateProgramItem(
      handle=handle,
      location=StateLocation(entries=dict()),
      update=update
    )

    self._items[handle] = item

    for namespace, consumer in self._consumers.items():
      value = state # [namespace]
      assert value

      def notify(event: StateEvent):
        self._handle_event(item, namespace, event)

      consumer.add(item, value, notify=notify, stack=stack)

  async def remove(self, handle: 'ProgramHandle'):
    for consumer in self._consumers.values():
      await consumer.remove(self._items[handle])

    del self._items[handle]

  def apply(self, handle: 'ProgramHandle', *, terminal: bool = False):
    from .fiber.master2 import ProgramHandle

    # origin_item = self._items[handle]
    # assert not origin_item.applied

    origin_item: Optional[StateProgramItem] = None
    relevant_items = list[StateProgramItem]()
    current_handle = handle

    while isinstance(current_handle, ProgramHandle):
      item = self._items.get(current_handle)

      if item:
        if not item.applied:
          origin_item = origin_item or item
          relevant_items.append(item)
        else:
          break

      current_handle = current_handle._parent

    if terminal:
      if not origin_item:
        return None
    else:
      assert origin_item

    events_by_item = { item: dict[str, StateEvent]() for item in relevant_items }

    for namespace, consumer in self._consumers.items():
      for item, event in consumer.apply(origin_item, self._items).items():
        events_by_item[item][namespace] = event

    # state_records = dict[ProgramHandle, StateRecord]()

    for item in relevant_items:
      item_events = events_by_item[item]

      if not item.applied:
        item.applied = True

        for namespace, event in item_events.items():
          assert event.location

          item.location.entries[namespace] = StateLocationUnitEntry(
            location=event.location,
            settled=event.settled
          )

        item.settled = all(entry.settled for entry in item.location.entries.values())

        state_record = StateRecord(
          errors=list(itertools.chain.from_iterable(record.errors for record in item_events.values())),
          location=copy.deepcopy(item.location),
          settled=item.settled
        )

        item.update(state_record, update=False)

        if not item.settled:
          item.settle_future = asyncio.Future()

    unsettled_items = [item for item in relevant_items if not item.settled]

    async def func():
      await asyncio.wait([item.settle_future for item in relevant_items if item.settle_future])

    return func() if unsettled_items else None

  async def suspend(self, handle: 'ProgramHandle'):
    item = self._items[handle]
    assert item.applied

    item.applied = False
    item.settled = False

    for entry in item.location.entries.values():
      entry.settled = False

    for index, (namespace, consumer) in enumerate(self._consumers.items()):
      event = await consumer.suspend(item)
      last = index == (len(self._consumers) - 1)

      if event:
        self._handle_event(item, namespace, event, skip_update=last)



@dataclass
class DemoStateLocation:
  value: int

  def export(self):
    return { "foo": "bar" }

class DemoStateInstance(UnitStateInstance):
  _next_index = 0

  def __init__(self, *, notify, stack):
    self._index = self._next_index
    type(self)._next_index += 1

    from .host import logger
    self._logger = logger.getChild(f"stateInstance{self._index}")
    self._logger.debug("Created")
    self._notify = notify

  def prepare(self, *, resume: bool):
    self._logger.debug(f'Prepare, resume={resume}')

  def apply(self, *, resume: bool):
    self._logger.debug(f'Apply, resume={resume}')

    wait = False # self._index == 1

    async def task():
      # await asyncio.sleep(1)
      # self._notify(StateEvent(errors=[
      #   Error(f"Problem {self._index}a")
      # ]))

      await asyncio.sleep(1)

      self._notify(StateEvent(DemoStateLocation(2), settled=False))

      await asyncio.sleep(1)

      self._notify(StateEvent(DemoStateLocation(3),
        settled=True, errors=[
        Error(f"Problem {self._index}b")
      ]))

      # self._notify(StateEvent(DemoStateLocation(), errors=[
      #   # Error(f"Problem {self._index}a"),
      #   # Error(f"Problem {self._index}b")
      # ]))

    if wait:
      asyncio.create_task(task())

    return StateEvent(DemoStateLocation(1), errors=[
      Error(f"Apply {self._index}")
    ], settled=(not wait))

  async def close(self):
    self._logger.debug('Close')

  async def suspend(self):
    self._logger.debug('Suspend')
    # self._notify(StateEvent())

    # await asyncio.sleep(1)

    if 1:
      self._notify(StateEvent(DemoStateLocation(9)))
      await asyncio.sleep(0.6)
      self._logger.debug('Suspended')

    return StateEvent(DemoStateLocation(10))

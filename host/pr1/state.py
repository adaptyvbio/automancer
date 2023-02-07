from abc import ABC, abstractmethod
import asyncio
import copy
from dataclasses import KW_ONLY, dataclass, field
import itertools
from typing import TYPE_CHECKING, Any, Callable, Optional, Protocol

from .devices.claim import ClaimSymbol
from .fiber.eval import EvalStack
from .fiber.parser import BlockState, BlockUnitState
from .error import Error
from .util.misc import Exportable

if TYPE_CHECKING:
  from .fiber.master2 import ProgramHandle
  from .units.base import BaseRunner


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


@dataclass(kw_only=True)
class StateProgramItem:
  handle: 'ProgramHandle'
  depth: int
  parent: 'Optional[StateProgramItem]'

  applied: bool = False
  location: StateLocation
  settled: bool = False
  settle_future: Optional[asyncio.Future[None]] = None
  state: Optional[BlockState] = None
  update: Callable

  def ancestors(self):
    current_item = self

    while current_item:
      yield current_item
      current_item = current_item.parent

  # self < other => self is an ancestor of other
  # def __lt__(self, other: 'StateProgramItem'):
  #   for ancestor_item in other.ancestors():
  #     if ancestor_item is self:
  #       return True

  # self < other => self is an ancestor of other
  def __lt__(self, other: 'StateProgramItem'):
    depth_diff = other.depth - self.depth
    return (depth_diff > 0) and next(itertools.islice(other.ancestors(), depth_diff, None)) is self

  def __eq__(self, other: 'StateProgramItem'):
    return not (self < other) and not (self > other) # type: ignore

  def __hash__(self):
    return id(self)

class UnitStateInstance(ABC):
  def __init__(self, *, notify: Callable[[StateEvent], None], stack: EvalStack):
    ...

  @abstractmethod
  def apply(self, *, resume: bool) -> StateEvent:
    ...

  @abstractmethod
  async def close(self):
    ...

  @abstractmethod
  async def suspend(self) -> Optional[StateEvent]:
    ...

class UnitStateManager(ABC):
  def __init__(self, runner: 'BaseRunner'):
    ...

  @abstractmethod
  def add(self, item: StateProgramItem, state: BlockUnitState, *, notify: Callable[[StateEvent], None], stack: EvalStack):
    ...

  @abstractmethod
  async def remove(self, item: StateProgramItem):
    ...

  @abstractmethod
  def apply(self, item: StateProgramItem, items: 'dict[ProgramHandle, StateProgramItem]') -> dict[StateProgramItem, StateEvent]:
    ...

  @abstractmethod
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

  def _handle_event(self, item: StateProgramItem, namespace: str, event: StateEvent):
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
    ), update=(not change))

  def add(self, handle: 'ProgramHandle', state: BlockState, *, stack: EvalStack, update: Callable):
    from .fiber.master2 import ProgramHandle

    current_handle = handle

    while isinstance(parent_handle := current_handle._parent, ProgramHandle):
      current_handle = parent_handle

      if current_handle in self._items:
        break

    parent_item = (self._items[current_handle] if current_handle is not handle else None)

    item = StateProgramItem(
      depth=(parent_item.depth + 1 if parent_item else 0),
      handle=handle,
      location=StateLocation(entries=dict()),
      parent=parent_item,
      update=update
    )

    self._items[handle] = item

    for namespace, consumer in self._consumers.items():
      value = state[namespace]
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

    for (namespace, consumer) in self._consumers.items():
      event = await consumer.suspend(item)

      if event:
        self._handle_event(item, namespace, event)



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

    wait = False # self._index == 0 # self._index == 1

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
      from .util.asyncio import run_anonymous
      run_anonymous(task())

    return StateEvent(DemoStateLocation(1), errors=[
      Error(f"Apply {self._index}")
    ], settled=(not wait))

  async def close(self):
    self._logger.debug('Close')

  async def suspend(self):
    self._logger.debug('Suspend')
    # self._notify(StateEvent())

    # await asyncio.sleep(1)

    if 0:
      self._notify(StateEvent(DemoStateLocation(9)))
      await asyncio.sleep(1.0)
      self._logger.debug('Suspended')

    return StateEvent(DemoStateLocation(10))

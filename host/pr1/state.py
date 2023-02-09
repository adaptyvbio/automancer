import asyncio
import copy
import itertools
from abc import ABC, abstractmethod
from asyncio import Event
from dataclasses import KW_ONLY, dataclass, field
from typing import TYPE_CHECKING, Any, Callable, Optional, Protocol

from .devices.claim import ClaimSymbol
from .error import Error
from .fiber.eval import EvalStack
from .fiber.parser import BlockState, BlockUnitState
from .util.misc import Exportable

if TYPE_CHECKING:
  from .fiber.master2 import ProgramHandle
  from .units.base import BaseRunner


class StateInternalError(Error):
  def __init__(self, message: str):
    super().__init__(message)

class StateProtocolError(Error):
  def __init__(self, message: str):
    super().__init__(message)


@dataclass
class StateEvent:
  location: Optional[Exportable] = None
  _: KW_ONLY
  errors: list[Error] = field(default_factory=list)
  failure: bool = False
  settled: bool = False
  time: Optional[float] = None

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
  entries: dict[str, Optional[StateLocationUnitEntry]]

  def export(self):
    return {
      namespace: entry and entry.export() for namespace, entry in self.entries.items()
    }

@dataclass(kw_only=True)
class StateRecord:
  errors: list[Error]
  failure: bool
  location: StateLocation
  settled: bool


@dataclass(kw_only=True)
class StateProgramItem:
  applied: bool = False
  children: 'list[StateProgramItem]' = field(default_factory=list, init=False)
  handle: 'ProgramHandle'
  depth: int
  location: StateLocation
  parent: 'Optional[StateProgramItem]'

  _failed: bool = False
  _settle_event: Event = field(default_factory=Event, init=False)
  _update_program: Callable[[StateRecord], None]

  def __post_init__(self):
    if not self.location.entries:
      self._settle_event.set()

  @property
  def settled(self):
    return self._settle_event.is_set()

  def ancestors(self):
    current_item = self

    while current_item:
      yield current_item
      current_item = current_item.parent

  def descendants(self):
    return itertools.chain.from_iterable(item.children for item in self.ancestors())

  # self < other => self is an ancestor of other
  def __lt__(self, other: 'StateProgramItem'):
    depth_diff = other.depth - self.depth
    return (depth_diff > 0) and next(itertools.islice(other.ancestors(), depth_diff, None)) is self

  def __eq__(self, other: 'StateProgramItem'):
    return not (self < other) and not (self > other) # type: ignore

  def __hash__(self):
    return id(self)

  def _update(self, *, errors: Optional[list[Error]], failure: bool = False):
    self._update_program(StateRecord(
      errors=(errors or list()),
      failure=failure,
      location=copy.deepcopy(self.location),
      settled=self.settled
    ))

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
  async def apply(self, items: list[StateProgramItem]):
    ...

  @abstractmethod
  async def clear(self, item: Optional[StateProgramItem]):
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

  async def apply(self, items):
    for item in items:
      try:
        self._instances[item].apply(resume=False)
      except Exception as e:
        item._update(
          errors=[StateInternalError(f"State consumer internal error: {e}")],
          failure=True
        )

  async def clear(self, item):
    pass

  async def suspend(self, item):
    return await self._instances[item].suspend()


class GlobalStateManager:
  def __init__(self, consumers: dict[str, UnitStateConsumer]):
    self._consumers: dict[str, UnitStateManager] = { namespace: (UnitStateInstanceManager(consumer) if isinstance(consumer, type) else consumer) for namespace, consumer in consumers.items() }
    self._items = dict['ProgramHandle', StateProgramItem]()

  def _handle_event(self, item: StateProgramItem, namespace: str, event: StateEvent):
    entry = item.location.entries[namespace]

    if entry is None:
      assert event.location

      entry = item.location.entries[namespace] = StateLocationUnitEntry(
        location=event.location,
        settled=event.settled
      )
    else:
      entry.settled = event.settled

      if event.location:
        entry.location = event.location

    if all(entry and entry.settled for entry in item.location.entries.values()):
      item._settle_event.set()
    else:
      item._settle_event.clear()

    item._failed = item._failed or event.failure

    item._update(
      errors=event.errors,
      failure=event.failure
    )

  def add(self, handle: 'ProgramHandle', state: BlockState, *, stack: EvalStack, update: Callable[[StateRecord], None]):
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
      location=StateLocation(entries={ namespace: None for namespace in self._consumers.keys() }),
      parent=parent_item,

      _update_program=update
    )

    if parent_item:
      parent_item.children.append(item)

    self._items[handle] = item

    for namespace, consumer in self._consumers.items():
      value = state # [namespace]
      assert value

      def notify(event: StateEvent):
        self._handle_event(item, namespace, event)

      consumer.add(item, value, notify=notify, stack=stack)

  async def remove(self, handle: 'ProgramHandle'):
    item = self._items[handle]

    for consumer in self._consumers.values():
      await consumer.remove(item)

    if item.parent:
      item.parent.children.remove(item)

    del self._items[handle]

  async def apply(self, handle: 'ProgramHandle', *, terminal: bool = False):
    from .fiber.master2 import ProgramHandle

    origin_item: Optional[StateProgramItem] = None
    current_handle = handle

    while isinstance(current_handle, ProgramHandle) and not (origin_item := self._items.get(current_handle)):
      current_handle = current_handle._parent

    assert origin_item

    failed = False
    relevant_items = [ancestor_item for ancestor_item in origin_item.ancestors() if not ancestor_item.applied]

    for item in relevant_items:
      item._failed = False

    for namespace, consumer in self._consumers.items():
      try:
        await consumer.apply(relevant_items)
      except Exception as e:
        failed = True

        item = relevant_items[0]
        item._update(
          errors=[StateInternalError(f"State consumer '{namespace}' internal error: {e}")],
          failure=True
        )

    for item in relevant_items:
      item.applied = True

    for item in relevant_items:
      errors = list[Error]()

      for namespace in self._consumers.keys():
        entry = item.location.entries[namespace]

        if not entry:
          errors.append(StateProtocolError(f"State consumer '{namespace}' did not provide a location synchronously"))

      item._update(errors=errors)

    for item in origin_item.ancestors():
      await item._settle_event.wait()

    return failed or any(item._failed for item in origin_item.ancestors())

  async def clear(self, handle: Optional['ProgramHandle'] = None):
    for consumer in self._consumers.values():
      await consumer.clear(self._items[handle] if handle else None)

  async def suspend(self, handle: 'ProgramHandle'):
    item = self._items[handle]
    assert item.applied

    item.applied = False
    item._settle_event.clear()

    for entry in item.location.entries.values():
      assert entry
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

    self._flag = 0

    from .host import logger
    self._logger = logger.getChild(f"stateInstance{self._index}")
    self._logger.debug("Created")
    self._notify = notify

  def apply(self, *, resume: bool):
    self._logger.debug(f'Apply, resume={resume}')

    wait = 0 # self._index == 0 # self._index == 1

    async def task():
      # await asyncio.sleep(1)
      # self._notify(StateEvent(errors=[
      #   Error(f"Problem {self._index}a")
      # ]))

      # await asyncio.sleep(1)
      # self._notify(StateEvent(DemoStateLocation(2), settled=False))

      await asyncio.sleep(1)

      self._notify(StateEvent(DemoStateLocation(3),
        settled=True,
        errors=[Error(f"Problem {self._index}b")]
      ))

      # self._notify(StateEvent(DemoStateLocation(), errors=[
      #   # Error(f"Problem {self._index}a"),
      #   # Error(f"Problem {self._index}b")
      # ]))

    if wait:
      from .util.asyncio import run_anonymous
      run_anonymous(task())

    self._notify(StateEvent(DemoStateLocation(1), errors=[
      Error(f"Applyyy {self._index}")
    ], failure=(self._index == 1 and self._flag == 0), settled=True)) # (not wait)))

    self._flag += 1

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

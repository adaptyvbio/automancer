from abc import ABC, abstractmethod
from asyncio import Event, Future, Handle, Lock, Semaphore, Task
from dataclasses import dataclass
from pint import Quantity, Measurement, Unit, UnitRegistry
from typing import Any, AsyncIterator, Awaitable, Callable, ClassVar, Coroutine, Generic, NewType, Optional, Protocol, Sequence, TypeVar, cast
import asyncio
import numpy as np
import traceback
import warnings

from .claim import Claimable
from ..ureg import ureg
from ..util.asyncio import run_anonymous
from ..util.types import SimpleCallbackFunction


T = TypeVar('T')

# Misc

NodePath = Sequence[str]


# Base nodes

@dataclass
class AsyncCancelable:
  cancel: Callable[[], Awaitable[None]]

class NodeUnavailableError(Exception):
  pass


class BaseNode(ABC):
  def __init__(self):
    self.connected: bool
    self.description: Optional[str] = None
    self.icon: Optional[str] = None
    self.id: str
    self.label: Optional[str] = None

    self._connection_listeners = list[SimpleCallbackFunction]()

  # Called by the producer

  @property
  def _label(self):
    return f"'{self.label or self.id}'"

  def _trigger_connection_listeners(self):
    for listener in self._connection_listeners:
      listener()

  # Called by the consumer

  def export(self):
    return {
      "id": self.id,
      "connected": self.connected,
      "description": self.description,
      "icon": self.icon,
      "label": self.label
    }

  def format(self, *, prefix: str = str()):
    return (f"{self.label} ({self.id})" if self.label else self.id) + f" \x1b[92m{self.__class__.__module__}.{self.__class__.__qualname__}\x1b[0m"

  def watch_connection(self, listener: SimpleCallbackFunction, /):
    """
    Watches the node's connection status for changes.

    Parameters
      listener: A callback called after the node's connection status changes, but not immediately after calling this function. The node's connection status is not provided by the callback but can be obtained using `connected`.

    Returns
      An `AsyncCancelable` which can be used stop watching the node.
    """

    self._connection_listeners.append(listener)

    async def cancel():
      self._connection_listeners.remove(listener)

    return AsyncCancelable(cancel)

class BaseConfigurableNode(BaseNode):
  @abstractmethod
  async def _configure(self):
    ...

  @abstractmethod
  async def _unconfigure(self):
    ...


class CollectionNode(BaseNode):
  def __init__(self):
    super().__init__()

    self.nodes: dict[str, BaseNode]
    self._listening = False

  def walk(self, callback: Callable[[BaseNode], None], /):
    for node in self.nodes.values():
      if not isinstance(node, CollectionNode):
        callback(node)
      else:
        node.walk(callback)

  async def walk_async(self, callback: Callable[[BaseNode], Awaitable], /):
    await asyncio.gather(*[
      callback(self),
      *[node.walk_async(callback) for node in self.nodes.values() if isinstance(node, CollectionNode)]
    ])

  # def watch_connection(self, listener, /):
  #   regs = set[AsyncCancelable]()

  #   if not self._listening:
  #     self._listening = True

  #     for node in self.nodes.values():
  #       if isinstance(node, PolledReadableNode):
  #         regs.add(node.watch(self._trigger_listeners, interval))
  #       elif isinstance(node, BaseWatchableNode):
  #         regs.add(node.watch(self._trigger_listeners))

  #   reg = super().watch(listener)

  #   async def cancel():
  #     nonlocal reg

  #     await reg.cancel()
  #     await asyncio.wait([reg.cancel() for reg in regs])

  #   return AsyncCancelable(cancel)

  def export(self):
    return {
      **super().export(),
      "nodes": { node.id: node.export() for node in self.nodes.values() }
    }

  def format(self, *, prefix: str = str()):
    output = super().format() + "\n"
    nodes = list(self.nodes.values())

    for index, node in enumerate(nodes):
      last = index == (len(nodes) - 1)
      output += prefix + ("└── " if last else "├── ") + node.format(prefix=(prefix + ("    " if last else "│   "))) + (str() if last else "\n")

    return output

class DeviceNode(CollectionNode):
  def __init__(self):
    super().__init__()

    self.model: str
    self.owner: str

  def export(self):
    return {
      **super().export(),
      "model": self.model,
      "owner": self.owner
    }


# Readable value nodes

ReadableNodeListener = Callable[['BaseReadableNode'], None]
ReadableNodeRevision = NewType('ReadableNodeRevision', int)

class BaseReadableNode(BaseNode):
  """
  A readable node.
  """

  def __init__(self):
    super().__init__()

    self._lock = Lock()
    self._revision = ReadableNodeRevision(0)
    self._value_listeners = set[SimpleCallbackFunction]()

  # To be implemented

  @abstractmethod
  async def _read(self) -> bool:
    """
    Updates the node's value.

    There will never be two concurrent calls to this method nor any call when the node is disconnected. The node may however be disconnected during the call, in which it might be cancelled; if not, this method should raise a `NodeUnavailableError` upon reaching a disconnection error.

    Returns
      `True` if the node's value has changed, `False` otherwise.

    Raises
      asyncio.CancelledError
      NodeUnavailableError: If the node is unavailable, for instance if it disconnects while its value is being fetched.
    """

    raise NotImplementedError

  async def read(self):
    """
    Updates the node's value.

    Returns
      A boolean indicating whether the node's value could be updated.

    Raises
      asyncio.CancelledError
    """

    async with self._lock:
      if self.connected:
        try:
          changed = await self._read()
        except NodeUnavailableError:
          pass
        else:
          if changed:
            self._revision = ReadableNodeRevision(self._revision + 1)

          return True

    return False

  @abstractmethod
  async def watch_value(self, listener: ReadableNodeListener, /) -> AsyncCancelable:
    """
    Watches the node by fetching its value at a regular interval.

    Returns once the node has been updated, although possibly while remaining disconnected and with a null value. Calling this method twice with the same `listener` (as defined by `__hash__()`) has the same effect as calling it once.

    Parameters
      interval: The maximal delay after which `listener` is called if a change occured immediately after its last call. Ignored if the node can report changes to its value.
      listener: A callback called when the node's value changes, but not immediately after calling this function and never before the latter returns. The node's value is not provided by the callback but can obtained using `value`.

    Returns
      An `AsyncCancelable` which can be used to stop watching the node.
    """

  @staticmethod
  async def watch_values(nodes: 'Sequence[BaseReadableNode]', listener: 'Callable[[set[BaseReadableNode]], None]'):
    """
    Watches multiple nodes for value changes.

    See `watch_value()` for details.
    """

    callback_handle: Optional[Handle] = None
    changed_nodes = set[BaseReadableNode]()
    ready = False

    def node_listener(node: BaseReadableNode):
      nonlocal callback_handle
      changed_nodes.add(node)

      if not callback_handle:
        loop = asyncio.get_event_loop()
        callback_handle = loop.call_soon(callback)

    def callback():
      if ready:
        nonlocal callback_handle
        callback_handle = None

        listener(changed_nodes.copy())
        changed_nodes.clear()

    regs = await asyncio.gather(*[node.watch_value(node_listener) for node in nodes])
    ready = True

    async def cancel():
      if callback_handle:
        callback_handle.cancel()

      for reg in regs:
        await reg.cancel()

    return AsyncCancelable(cancel)


# class BooleanReadableNode(BaseReadableNode[bool]):
#   def export(self):
#     return {
#       **super().export(),
#       "data": {
#         "type": "readableBoolean",
#         "value": self.value
#       }
#     }

class EnumNodeOption:
  def __init__(self, label: str):
    self.label = label
    self.value: Any

# class EnumReadableNode(BaseReadableNode[int]):
#   def __init__(self):
#     self.options: list[EnumNodeOption]
#     self.value: Optional[int] = None

#   def export(self):
#     def find_option_index(value):
#       return next((index for index, option in enumerate(self.options) if option.value == value), None)

#     return {
#       **super().export(),
#       "data": {
#         "type": "readableEnum",
#         "options": [{ 'label': option.label } for option in self.options],
#         "value": find_option_index(self.value)
#       }
#     }

class QuantityReadableNode(BaseReadableNode):
  _ureg: UnitRegistry = ureg

  def __init__(
    self,
    *,
    dtype: np.dtype | str = 'f4',
    unit: Optional[Unit | str] = None
  ):
    super().__init__()

    self.dtype = np.dtype(dtype)
    self.unit: Unit = self._ureg.Unit(unit or 'dimensionless') if (not unit) or isinstance(unit, str) else unit

    self.error = None
    self.value: Optional[Quantity] = None

  async def _read(self):
    old_value = self.value
    raw_value = await self._read_quantity()

    match raw_value:
      case Quantity():
        self.error = None
        self.value = raw_value
      case Measurement(error=error, value=value):
        self.error = error
        self.value = value
      case _:
        raise ValueError

    return self.value != old_value

  @abstractmethod
  async def _read_quantity(self) -> Measurement | Quantity:
    ...

  def export(self):
    return {
      **super().export(),
      "data": {
        "type": "readableScalar",
        "error": self.error.magnitude if self.error is not None else None,
        "unit": None,
        "value": self.value.magnitude if self.value is not None else None
      }
    }


# Writable value nodes

class BaseWritableNode(BaseNode, Claimable):
  pass

# class BaseWritableNode(BaseNode, Claimable, Generic[T]):
#   def __init__(self):
#     BaseNode.__init__(self)
#     Claimable.__init__(self)

#     self.current_value: Optional[T]
#     self.target_value: Optional[T]

  # To be implemented

  # @abstractmethod
  # async def write(self, value: Optional[T], /):
  #   raise NotImplementedError

  # @abstractmethod
  # async def write_import(self, value: Any, /):
  #   raise NotImplementedError

class BooleanWritableNode(BaseWritableNode):
  @abstractmethod
  async def write(self, value: bool, /):
    ...

  # async def write_import(self, value: bool):
  #   await self.write(value)

  # def export(self):
  #   return {
  #     **super().export(),
  #     "data": {
  #       "type": "writableBoolean",
  #       "currentValue": self.current_value,
  #       "targetValue": self.target_value
  #     }
  #   }

# class EnumWritableNode(BaseWritableNode[int]):
#   def __init__(self, *, options: list[EnumNodeOption]):
#     super().__init__()

#     self.options = options

#   async def write_import(self, value: int):
#     await self.write(value)

#   def export(self):
#     exported = super().export()

#     return {
#       **exported,
#       "data": {
#         "type": "writableEnum",
#         "options": [{ 'label': option.label } for option in self.options],
#         "currentValue": self.current_value,
#         "targetValue": self.target_value
#       }
#     }

class NumericWritableNode(BaseWritableNode):
  _ureg: UnitRegistry = ureg

  def __init__(
    self,
    *,
    deactivatable: bool = False,
    dtype: str = 'f4',
    factor: float = 1.0,
    max: Optional[Quantity | float] = None,
    min: Optional[Quantity | float] = None,
    unit: Optional[Unit | str] = None
  ):
    super().__init__()

    self.deactivatable = deactivatable
    self.dtype = dtype
    self.factor = factor
    self.unit: Unit = self._ureg.Unit(unit or 'dimensionless')

    self.max = (max * self.unit) if isinstance(max, float) else max
    self.min = (min * self.unit) if isinstance(min, float) else min

  # To be implemented

  @abstractmethod
  async def write(self, value: Optional[float], /):
    ...

  # Called by the consumer

  async def write_quantity(self, raw_value: Optional[Quantity | float], /):
    if raw_value is not None:
      value: Quantity = (raw_value * self.unit) if isinstance(raw_value, float) else raw_value.to(self.unit)

      if not value.check(self.unit):
        raise ValueError("Invalid unit")

      if (self.min is not None) and (value < self.min):
        raise ValueError("Value too small")
      if (self.max is not None) and (value > self.max):
        raise ValueError("Value too large")

      await self.write(value.magnitude / self.factor)
    else:
      if not self.deactivatable:
        raise ValueError("Value not deactivatable")

      await self.write(None)

  # def export(self):
  #   exported = super().export()

  #   return {}

    # return {
    #   **exported,
    #   "data": {
    #     "type": "writableScalar",
    #     "unit": None, # self.unit,
    #     "currentValue": self.current_value,
    #     "targetValue": self.target_value
    #   }
    # }

class ConfigurableWritableNode(BaseConfigurableNode, Generic[T]):
  """
  A configurable writable node.

  Attributes
    current_value: The node's last known value. This is `None` (1) when `_read()` is not implemented and the node has never been written to and connected or (2) when the node has always been disconnected.
    target_value: The node's target value. This is `None` when the target value is deactivation or when undefined (i.e. the user doesn't care about the node's value).
  """

  def __init__(self):
    super().__init__()

    self.connected = False

    self.current_value: Optional[T] = None
    self.target_value: Optional[T] = None

  # To be implemented

  async def _read(self) -> T:
    """
    Reads and returns the node's value.

    This method is optional.

    Raises
      asyncio.CancelledError
      NodeUnavailableError
      NotImplementedError
    """

    raise NotImplementedError

  @abstractmethod
  async def _write(self, value: T, /) -> None:
    """
    Writes the node's value.

    Raises
      asyncio.CancelledError
      NodeUnavailableError
    """

  # Called by the producer

  async def _configure(self):
    try:
      current_value = await self._read()
    except NodeUnavailableError:
      return
    except NotImplementedError:
      current_value = None
    else:
      self.current_value = current_value

    self.connected = True
    self._trigger_connection_listeners()

    if current_value != self.target_value:
      await self.write(self.target_value)

  async def _unconfigure(self):
    self.connected = False
    self._trigger_connection_listeners()

  # Called by the consumer

  async def write(self, value: Optional[T], /):
    self.target_value = value

    if self.connected and (value is not None):
      try:
        await self._write(value)
      except NodeUnavailableError:
        pass
      else:
        self.current_value = value


# Polled nodes

class SubscribableReadableNode(BaseReadableNode, BaseConfigurableNode):
  """
  A readable node whose changes can be reported by the node's implementation.
  """

  def __init__(self):
    super().__init__()

    self.connected = False

    self._value_listeners = set[ReadableNodeListener]()

    #
    # Node states
    #
    #   Attribute             | Initialization | Normal | Deinitialization
    #   ---------------------   --------------   ------   ----------------
    #   self._watch_init_task   Task             Task     None
    #   self._watch_task        None             Task     Task
    #
    self._watch_init_task: Optional[Task[Task[None]]] = None
    self._watch_task: Optional[Task[None]] = None

  # Internal

  async def _watch(self):
    ready_event = Event()

    async def func():
      nonlocal ready_event

      try:
        async for _ in self._subscribe():
          if ready_event.is_set():
            for listener in self._value_listeners:
              listener(self)

          ready_event.set()
      except NodeUnavailableError:
        pass
      else:
        warnings.warn("Subscription ended unexpectedly")
      finally:
        self._watch_task = None

    task = asyncio.create_task(func())

    try:
      await ready_event.wait()
    except asyncio.CancelledError:
      task.cancel()
      await task

    return task

  # To be implemented

  @abstractmethod
  def _subscribe(self) -> AsyncIterator[None]:
    """
    Subscribes to the node for changes.

    Yields
      `None` when the node's value changes, except for the first yield which must be performed as soon as possible.

    Raises
      asyncio.CancelledError
      NodeUnavailableError
    """

    raise NotImplementedError

  # Called by the producer

  async def _configure(self):
    if self._value_listeners:
      self._watch_init_task = asyncio.create_task(self._watch())
      self._watch_task = await self._watch_init_task

    self.connected = True

  async def _unconfigure(self):
    self.connected = False

    if self._watch_task:
      self._watch_task.cancel()

      try:
        await self._watch_task
      except asyncio.CancelledError:
        pass

  # Called by the consumer

  async def watch_value(self, listener, /):
    self._value_listeners.add(listener)

    # TODO: Wait for the previous watch to finish.

    if (not self._watch_init_task) and self.connected:
      self._watch_init_task = asyncio.create_task(self._watch())
      self._watch_task = await self._watch_init_task

    async def cancel():
      self._value_listeners.remove(listener)

      if (not self._value_listeners) and self._watch_task:
        self._watch_init_task = None
        self._watch_task.cancel()

        try:
          await self._watch_task
        except asyncio.CancelledError:
          pass

    return AsyncCancelable(cancel)

class PolledReadableNode(SubscribableReadableNode):
  """
  A readable node which whose changes can only be detected by polling.
  """

  def __init__(self, *, min_interval: float = 1.0):
    """
    Parameters
      min_interval: The minimal delay, in seconds, to wait between two calls to `_poll()`.
    """

    super().__init__()

    self._min_interval = min_interval

  # Internal

  async def _subscribe(self):
    last_revision: Optional[ReadableNodeRevision] = None

    while True:
      if not await self.read():
        raise NodeUnavailableError

      if self._revision != last_revision:
        last_revision = self._revision
        yield

      await asyncio.sleep(self._min_interval)

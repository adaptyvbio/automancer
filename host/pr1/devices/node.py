from dataclasses import dataclass
from pint import Quantity, Measurement, Unit, UnitRegistry
from typing import Any, AsyncIterator, Awaitable, Callable, Generic, Optional, Protocol, Sequence, TypeVar
import asyncio
import numpy as np
import traceback
import warnings

from .claim import Claimable
from ..ureg import ureg


T = TypeVar('T')

# Misc

NodePath = Sequence[str]


# Base nodes

@dataclass
class AsyncCancelable:
  cancel: Callable[[], Awaitable[None]]

class NodeUnavailableError(Exception):
  pass

class BaseNode:
  icon = None

  def __init__(self):
    self.connected: bool
    self.description: Optional[str]
    self.id: str
    self.label: Optional[str]

    self.icon: Optional[str]

  # Called by the producer

  @property
  def _label(self):
    return f"'{self.label or self.id}'"

  # Called by the consumer

  def export(self):
    return {
      "id": self.id,
      "icon": self.icon,
      "connected": self.connected,
      "description": self.description,
      "label": self.label
    }

  def format(self, *, prefix: str = str()):
    # class_self, *class_others = self.__class__.__mro__
    # return (self.label or f'"{self.id}"') + f" ({class_self.__name__} / {', '.join(class_other.__name__ for class_other in class_others)})"

    return (self.label or f'"{self.id}"') + f" ({self.__class__.__module__}.{self.__class__.__qualname__})"

class BaseWatchableNode(BaseNode):
  def __init__(self):
    super().__init__()

    self._listeners = list[Callable]()

  def _trigger_listeners(self):
    for listener in self._listeners:
      try:
        listener()
      except Exception:
        traceback.print_exc()

  def watch(self, listener: Optional[Callable[[], None]] = None, /):
    if listener:
      self._listeners.append(listener)

    async def cancel():
      if listener:
        self._listeners.remove(listener)

    return AsyncCancelable(cancel)

class ConfigurableNode(BaseNode):
  async def _configure(self):
    pass

  async def _unconfigure(self):
    pass

class CollectionNode(BaseWatchableNode):
  def __init__(self):
    super().__init__()

    self.nodes: dict[str, BaseNode]
    self._listening = False

  def transfer_claims(self):
    def walk(node: BaseNode):
      if isinstance(node, Claimable):
        node.transfer()

    self.walk(walk)

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

  def watch(self, listener: Optional[Callable[[], None]] = None, /, interval: Optional[float] = None):
    regs = set[AsyncCancelable]()

    if not self._listening:
      self._listening = True

      for node in self.nodes.values():
        if isinstance(node, PolledReadableNode):
          regs.add(node.watch(self._trigger_listeners, interval))
        elif isinstance(node, BaseWatchableNode):
          regs.add(node.watch(self._trigger_listeners))

    reg = super().watch(listener)

    async def cancel():
      nonlocal reg

      await reg.cancel()
      await asyncio.wait([reg.cancel() for reg in regs])

    return AsyncCancelable(cancel)

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

class BaseReadableNode(BaseNode, Generic[T]):
  def __init__(self):
    super().__init__()

    self.value: Optional[T]

  def _set_value(self, raw_value: Any, /):
    self.value = raw_value

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

class ScalarReadableNode(BaseNode):
  _ureg: UnitRegistry = ureg

  def __init__(
    self,
    *,
    dtype: np.dtype | str = '<f4',
    unit: Optional[Unit | str] = None
  ):
    super().__init__()

    self.dtype = np.dtype(dtype)
    self.unit: Unit = self._ureg.Unit(unit or 'dimensionless') if isinstance(unit, str) else unit

    self.error: Optional[Quantity] = None
    self.value: Optional[Quantity] = None

  def _set_value(self, raw_value: Optional[Measurement | Quantity], /):
    match raw_value:
      case Quantity(value=value):
        self.error = None
        self.value = value
      case Measurement(error=error, value=value):
        self.error = error
        self.value = value
      case _:
        raise ValueError()

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

class BaseWritableNode(BaseNode, Claimable, Generic[T]):
  def __init__(self):
    BaseNode.__init__(self)
    Claimable.__init__(self)

    self.current_value: Optional[T]
    self.target_value: Optional[T]

  # To be implemented

  async def write(self, value: Optional[T], /):
    raise NotImplementedError()

  async def write_import(self, value: Any, /):
    raise NotImplementedError()

class BooleanWritableNode(BaseWritableNode[bool]):
  async def write_import(self, value: bool):
    await self.write(value)

  def export(self):
    return {
      **super().export(),
      "data": {
        "type": "writableBoolean",
        "currentValue": self.current_value,
        "targetValue": self.target_value
      }
    }

class EnumWritableNode(BaseWritableNode[int]):
  def __init__(self, *, options: list[EnumNodeOption]):
    super().__init__()

    self.options = options

  async def write_import(self, value: int):
    await self.write(value)

  def export(self):
    exported = super().export()

    return {
      **exported,
      "data": {
        "type": "writableEnum",
        "options": [{ 'label': option.label } for option in self.options],
        "currentValue": self.current_value,
        "targetValue": self.target_value
      }
    }

class ScalarWritableNode(BaseWritableNode[float]):
  _ureg: UnitRegistry = ureg

  def __init__(
    self,
    *,
    deactivatable: bool = False,
    dtype: str = '<f4',
    factor: float = 1.0,
    max: Optional[Quantity | float] = None,
    min: Optional[Quantity | float] = None,
    unit: Optional[Unit | str] = None
  ):
    BaseWritableNode.__init__(self)

    self.deactivatable = deactivatable
    self.dtype = dtype
    self.factor = factor
    self.unit: Unit = self._ureg.Unit(unit or 'dimensionless') if isinstance(unit, str) else unit

    self.max = (max * self.unit) if isinstance(max, float) else max
    self.min = (min * self.unit) if isinstance(min, float) else min

  async def write(self, raw_value: Optional[Quantity | float], /):
    if raw_value is not None:
      value: Quantity = (raw_value * self.unit) if isinstance(raw_value, float) else raw_value.to(self.unit)
      assert value.check(self.unit)

      if self.min is not None:
        assert value >= self.min
      if self.max is not None:
        assert value <= self.max

      await super().write(value.magnitude / self.factor)
    else:
      await super().write(None)

  async def write_import(self, value: float):
    await self.write(value)

  def export(self):
    exported = super().export()

    return {
      **exported,
      "data": {
        "type": "writableScalar",
        "unit": None, # self.unit,
        "currentValue": self.current_value,
        "targetValue": self.target_value
      }
    }

class ConfigurableWritableNode(BaseWritableNode, BaseWatchableNode, Generic[T]):
  def __init__(self):
    BaseWatchableNode.__init__(self)
    BaseWritableNode.__init__(self)

    self.connected = False

    # This is None when the value is unknown, which can happen in the following cases:
    #   (1) the self._read() method is not implemented;
    #   (2) the device has always been disconnected.
    # When disconnected, self.current_value contains the last known value and will not always be None.
    self.current_value: Optional[T] = None

    # This is None when the user doesn't care about the value, in which case no write shoud happen.
    self.target_value: Optional[T] = None

  # To be implemented

  # This method may raise a NodeUnavailableError exception to indicate that the node is not available
  # on the underlying device, e.g. because of a configuration or disconnection issue.
  async def _read(self) -> T:
    raise NotImplementedError()

  async def _write(self, value: T) -> None:
    raise NotImplementedError()

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

    if current_value != self.target_value:
      await self.write(self.target_value)

    self._trigger_listeners()

  async def _unconfigure(self):
    self.connected = False
    self._trigger_listeners()

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

    self._trigger_listeners()

class BatchableWritableNode(BaseWritableNode, BaseWatchableNode, Generic[T]):
  def __init__(self):
    BaseWatchableNode.__init__(self)
    BaseWritableNode.__init__(self)

    self._group: 'BatchGroupNode'

    self.connected = False

    self.current_value: Optional[T] = None
    self.target_value: Optional[T] = None

  # To be implemented

  async def _read(self) -> T:
    raise NotImplementedError()

  # Called by the consumer

  # @property
  # def connected(self):
  #   return self._group.connected

  async def write(self, value: Optional[T], /):
    self.target_value = value

    if self.connected:
      try:
        await self._group._add(self)
      except NodeUnavailableError:
        pass
      else:
        self.current_value = value

    self._trigger_listeners()

S = TypeVar('S', bound=BatchableWritableNode)

class BatchGroupNode(BaseNode, Generic[S]):
  def __init__(self):
    self._changed_nodes = set[S]()
    self._future = asyncio.Future[None]()
    self._group_nodes: set[S]

  # Internal

  def _add(self, node: S, /):
    assert node in self._group_nodes

    self._changed_nodes.add(node)
    return self._future

  # To be implemented

  async def _read(self, nodes: set[S], /) -> dict[S, Any]:
    raise NotImplementedError()

  async def _write(self, nodes: set[S], /) -> None:
    raise NotImplementedError()

  # Called by the producer

  async def _configure(self):
    try:
      values = await self._read(self._group_nodes)
    except NodeUnavailableError:
      return
    except NotImplementedError:
      for node in self._group_nodes:
        try:
          node.current_value = await node._read()
        except NodeUnavailableError:
          continue
        except NotImplementedError:
          node.current_value = None
        else:
          node.connected = True
    else:
      for node, value in values.items():
        node.current_value = value

    self.connected = True

    awaitables = set[Awaitable]()

    for node in self._group_nodes:
      if node.connected and (node.target_value is not None) and (node.current_value != node.target_value):
        awaitables.add(node.write(node.target_value))

    await asyncio.gather(*awaitables)

    for node in self._group_nodes:
      node._trigger_listeners()

  async def _unconfigure(self):
    self.connected = False

    for node in self._group_nodes:
      node.connected = False
      node._trigger_listeners()

  # Called by the consumer

  async def commit(self):
    if self.connected and self._changed_nodes:
      try:
        await self._write(self._changed_nodes)
      except NodeUnavailableError as e:
        self._future.set_exception(e)
      else:
        self._future.set_result(None)
        self._future = asyncio.Future[None]()
        self._changed_nodes.clear()


# Polled nodes

class PolledReadableNode(BaseWatchableNode, ConfigurableNode, Generic[T]):
  def __init__(self, *, min_interval: float = 0.0):
    super().__init__()

    self.connected = False
    self.interval: float
    self.value: Optional[T] = None

    self._intervals = list[float]()
    self._min_interval = min_interval
    self._poll_task: Optional[asyncio.Task[None]] = None

  # Internal

  @property
  def _interval(self) -> Optional[float]:
    return max(min(self._intervals), self._min_interval) if self._intervals else None

  async def _poll(self):
    try:
      while self._interval is not None:
        await asyncio.sleep(self._interval)
        value = await self._read()

        if value != self.value:
          self.value = value
          self._trigger_listeners()
    except (asyncio.CancelledError, NodeUnavailableError):
      pass
    finally:
      self._poll_task = None

    self._poll_task = asyncio.create_task(poll_loop())

  # To be implemented

  # This method may throw a NodeUnavailableError exception.
  async def _read(self) -> T:
    raise NotImplementedError()

  # Called by the producer

  async def _configure(self):
    try:
      self.value = await self._read()
    except NodeUnavailableError:
      return

    self.connected = True
    self._trigger_listeners()

    if self._interval is not None:
      self._poll()

  async def _unconfigure(self):
    self.connected = False
    self._trigger_listeners()

    if self._poll_task:
      self._poll_task.cancel()

  # Called by the consumer

  def watch(self, listener: Optional[Callable[[], None]] = None, /, interval: Optional[float] = None):
    reg = super().watch(listener)

    if interval is not None:
      self._intervals.append(interval)

      if (not self._poll_task) and self.connected:
        self._poll()

      async def cancel():
        nonlocal reg
        await reg.cancel()
        self._intervals.remove(interval)

      return AsyncCancelable(cancel)

    return reg

class SubscribableReadableNode(BaseReadableNode, BaseWatchableNode, ConfigurableNode, Generic[T]):
  def __init__(self):
    super().__init__()

    self.connected = False
    self.value: Optional[T] = None

    self._watch_task: Optional[asyncio.Task[None]] = None

  # Internal

  async def _cancel_watch_task(self):
    assert self._watch_task
    self._watch_task.cancel()

    try:
      await self._watch_task
    except asyncio.CancelledError:
      pass

    self._watch_task = None

  async def _watch(self, initial_future: Optional[asyncio.Future[None]] = None):
    future = initial_future

    try:
      async for value in self._subscribe():
        self._set_value(value)
        self._trigger_listeners()

        if future:
          future.set_result(None)
          future = None
    except NodeUnavailableError as e:
      if future:
        future.set_exception(e)
    else:
      warnings.warn("Subscription ended unexpectedly")
    finally:
      self._watch_task = None

  # To be implemented

  def _subscribe(self) -> AsyncIterator[T]:
    raise NotImplementedError()

  # Called by the producer

  async def _configure(self):
    if self._listeners and (not self._watch_task):
      future = asyncio.Future[None]()
      self._watch_task = asyncio.create_task(self._watch(future))

      try:
        await future
      except NodeUnavailableError:
        return

    self.connected = True

  async def _unconfigure(self):
    self.connected = False

    if self._watch_task:
      await self._cancel_watch_task()

  # Called by the consumer

  def watch(self, listener: Optional[Callable[[], None]] = None, /):
    reg = super().watch(listener)

    if self.connected and (not self._watch_task):
      self._watch_task = asyncio.create_task(self._watch())

    async def cancel():
      nonlocal reg

      await reg.cancel()

      if not self._listeners:
        await self._cancel_watch_task()

    return AsyncCancelable(cancel)


if __name__ == "__main__":
  class CustomNode(SubscribableReadableNode[Measurement], ScalarReadableNode):
    async def _subscribe(self):
      for i in range(5):
        await asyncio.sleep(0.5)
        yield i

      raise NodeUnavailableError

  node = CustomNode()
  reg = node.watch(lambda: print(node.value))

  async def main():
    await node._configure()
    await asyncio.sleep(2)
    await node._unconfigure()
    await node._configure()
    await asyncio.sleep(3)
    await node._unconfigure()

  asyncio.run(main())

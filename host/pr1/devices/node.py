import asyncio
import traceback
from pint import Quantity, Unit, UnitRegistry
from typing import Any, Callable, Generic, Optional, Protocol, Sequence, TypeVar

from .claim import Claimable
from ..ureg import ureg


T = TypeVar('T')

# Misc

NodePath = Sequence[str]


# Base nodes

class Cancelable:
  def cancel(self):
    raise NotImplementedError()

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

class BaseWatchableNode(BaseNode):
  def __init__(self):
    super().__init__()

    self._listeners: set[Callable] = set()

  def _trigger_listeners(self):
    for listener in self._listeners:
      try:
        listener()
      except Exception:
        traceback.print_exc()

  def watch(self, listener: Optional[Callable[[], None]] = None, /, interval: Optional[float] = None):
    if listener:
      self._listeners.add(listener)

    def cancel():
      if listener:
        self._listeners.remove(listener)

    reg = Cancelable()
    reg.cancel = cancel

    return reg


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

  def watch(self, listener: Optional[Callable[[], None]] = None, /, interval: Optional[float] = None):
    regs = set()

    if not self._listening:
      self._listening = True

      for node in self.nodes.values():
        if isinstance(node, BaseWatchableNode):
          regs.add(node.watch(self._trigger_listeners, interval))

    reg = super().watch(listener, interval)
    old_cancel = reg.cancel

    def cancel():
      old_cancel()
      for reg in regs: reg.cancel()

    reg.cancel = cancel
    return reg

  def export(self):
    return {
      **super().export(),
      "nodes": { node.id: node.export() for node in self.nodes.values() }
    }

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

    self.value: Optional[T] = None

class BooleanReadableNode(BaseReadableNode[bool]):
  def export(self):
    return {
      **super().export(),
      "data": {
        "type": "readableBoolean",
        "value": self.value
      }
    }

class EnumNodeOption:
  def __init__(self, label: str):
    self.label = label
    self.value: Any

class EnumReadableNode(BaseReadableNode[int]):
  def __init__(self):
    self.options: list[EnumNodeOption]
    self.value: Optional[int] = None

  def export(self):
    def find_option_index(value):
      return next((index for index, option in enumerate(self.options) if option.value == value), None)

    return {
      **super().export(),
      "data": {
        "type": "readableEnum",
        "options": [{ 'label': option.label } for option in self.options],
        "value": find_option_index(self.value)
      }
    }

class ScalarReadableNode(BaseReadableNode[float]):
  def __init__(self):
    super().__init__()

    self.error: Optional[float] = None
    self.unit = None
    self.value: Optional[float] = None

  def export(self):
    return {
      **super().export(),
      "data": {
        "type": "readableScalar",
        "error": self.error,
        "unit": self.unit,
        "value": self.value
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

  async def write(self, value: Optional[T]):
    raise NotImplementedError()

  async def write_import(self, value: Any):
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
    dtype: str = '<f32',
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
    self.current_value: Optional[T] = None
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

    if self.target_value is None:
      self.target_value = self.current_value

    self.connected = True

    if (self.target_value is not None) and (current_value != self.target_value):
      await self.write(self.target_value)

    self._trigger_listeners()

  async def _unconfigure(self):
    self.connected = False
    self._trigger_listeners()

  # Called by the consumer

  async def write(self, value: T, /):
    self.target_value = value

    if self.connected:
      try:
        await self._write(value)
      except NodeUnavailableError:
        pass
      else:
        self.current_value = value

    self._trigger_listeners()


# Polled nodes

class PolledReadableNode(BaseReadableNode[T], BaseWatchableNode, Generic[T]):
  def __init__(self, *, min_interval = 0.0):
    super().__init__()

    self.connected: bool = False
    self.interval: float

    self._intervals: list[float] = list()
    self._min_interval = min_interval
    self._poll_task: Optional[asyncio.Task] = None

  # Internal

  @property
  def _interval(self) -> Optional[float]:
    return max(min(self._intervals), self._min_interval) if self._intervals else None

  def _poll(self):
    async def poll_loop():
      try:
        while self._interval is not None:
          await asyncio.sleep(self._interval)
          value = await self._read()

          if value != self.value:
            self.value = value
            self._trigger_listeners()
      except (asyncio.CancelledError, NodeUnavailableError):
        pass
      except Exception:
        traceback.print_exc()
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
    reg = super().watch(listener, interval)
    old_cancel = reg.cancel

    if interval is not None:
      self._intervals.append(interval)

      def cancel():
        old_cancel()
        self._intervals.remove(interval)

      reg.cancel = cancel

      if (not self._poll_task) and self.connected:
        self._poll()

    return reg

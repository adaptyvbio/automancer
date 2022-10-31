import asyncio
import traceback
from typing import Callable, Generic, Optional, Protocol, TypeVar


# Base nodes

class Cancelable:
  def cancel(self):
    raise NotImplementedError()

class BaseNode:
  def __init__(self):
    self.connected: bool
    self.id: str
    self.label: Optional[str]

  def export(self):
    return {
      "id": self.id,
      "connected": self.connected,
      "label": self.label
    }

class BaseListenableNode(BaseNode):
  def __init__(self):
    super().__init__()
    self._listeners: set[Callable] = set()

  def _trigger_listeners(self):
    for listener in self._listeners:
      try:
        listener()
      except Exception:
        traceback.print_exc()

  def listen(self, listener: Callable[[], None]):
    self._listeners.add(listener)

    registration = Cancelable()
    registration.cancel = lambda: self._listeners.remove(listener)
    return registration


class BaseReadonlyNode(BaseListenableNode):
  def register(self, *, interval: float):
    raise NotImplementedError()

class CollectionNode(BaseListenableNode):
  def __init__(self):
    super().__init__()

    self.nodes: dict[str, BaseNode]
    self._listening = False

  def listen(self, listener: Callable[[], None]):
    if not self._listening:
      self._listening = True

      for node in self.nodes.values():
        if isinstance(node, BaseListenableNode):
          node.listen(self._trigger_listeners)

    super().listen(listener)

  def export(self):
    return {
      **super().export(),
      "nodes": { node.id: node.export() for node in self.nodes.values() }
    }

class DeviceNode(CollectionNode):
  def __init__(self):
    self.model: str
    self.owner: str

  def export(self):
    return {
      **super().export(),
      "model": self.model,
      "owner": self.owner
    }


# Simple readonly value nodes

class ReadonlyBooleanNode(BaseReadonlyNode):
  def __init__(self):
    self.value: Optional[bool] = None

  def export(self):
    return {
      **super().export(),
      "data": {
        "type": "readonlyBoolean",
        "value": self.value
      }
    }

class EnumNodeOption(Protocol):
  label: str
  value: int

class ReadonlyEnumNode(BaseReadonlyNode):
  def __init__(self):
    self.options: list[EnumNodeOption]
    self.value: Optional[int] = None

  def export(self):
    def find_option_index(value):
      return next((index for index, option in enumerate(self.options) if option.value == value), None)

    return {
      "type": "select",
      "options": [{ 'label': option.label } for option in self.options],
      "value": find_option_index(self.value)
    }

class ReadonlyScalarNode(BaseReadonlyNode):
  def __init__(self):
    super().__init__()

    self.error: Optional[float] = None
    self.unit = None
    self.value: Optional[float] = None

  def export(self):
    return {
      **super().export(),
      "data": {
        "type": "scalar",
        "value": self.value
      }
    }


# Polled

class PolledNodeUnavailableError(Exception):
  pass

T = TypeVar('T')

class PolledReadonlyNode(BaseReadonlyNode, Generic[T]):
  def __init__(self, *, min_interval = 0.0):
    self.connected: bool = False
    self.interval: float
    self.value: Optional[T]

    self._intervals: list[float] = list()
    self._min_interval = min_interval
    self._poll_task: Optional[asyncio.Task] = None

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
      except (asyncio.CancelledError, PolledNodeUnavailableError):
        pass
      except Exception:
        traceback.print_exc()
      finally:
        self.connected = False
        self._poll_task = None

    self._poll_task = asyncio.create_task(poll_loop())

  async def _read(self) -> T:
    raise NotImplementedError()

  def register(self, *, interval: float):
    self._intervals.append(interval)

    if (not self._poll_task) and self.connected:
      self._poll()

    registration = Cancelable()
    registration.cancel = lambda: self._intervals.remove(interval)
    return registration

  async def _configure(self):
    self.value = await self._read()
    self.connected = True
    self._trigger_listeners()

    if self._interval is not None:
      self._poll()

  async def _unconfigure(self):
    self.connected = False
    self._trigger_listeners()

    if self._poll_task:
      self._poll_task.cancel()

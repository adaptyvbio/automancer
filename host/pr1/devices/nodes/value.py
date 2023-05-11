import time
from abc import ABC, abstractmethod
from asyncio import Event, Lock
from typing import Any, Generic, NewType, Optional, TypeVar, final

from ...util.asyncio import DualEvent
from ...util.pool import Pool
from ..claim import Claimable
from .common import (BaseNode, NodeListener, NodeListenerMode,
                     NodeUnavailableError)


@final
class NullType:
  pass

Null = NullType()


T = TypeVar('T')

NodeRevision = NewType('NodeRevision', int)

class ValueNode(BaseNode, ABC, Generic[T]):
  def __init__(
      self,
      *,
      nullable: bool = False,
      pool: Pool,
      readable: bool = False,
      stable: bool = True,
      writable: bool = False
    ):
    """
    Creates a value node.

    Parameters
      nullable: Whether the node's value can be set to a disabled state known as `Null`.
      readable: Whether the node is readable.
      stable: Whether the node's value might change due to external cause, despite being claimed.
      writable: Whether the node is writable.
    """

    super().__init__()

    self._pool = pool

    # This is updated each time _read() returns true, meaning self.value changed.
    self._revision = NodeRevision(0)

    # None -> value is unknown
    self.value: Optional[tuple[float, T | NullType]] = None

    self.stable = stable
    self.nullable = nullable
    self.readable = readable
    self.writable = writable

    if self.readable:
      self._read_lock = Lock()

    if self.writable:
      self.claimable = Claimable(change_callback=self._claim_change)
      self.writer: Optional[NodeValueWriter] = None

  # Internal

  def _claim_change(self):
    self._trigger_listeners(mode='ownership')

  # To be implemented

  async def _clear(self):
    """
    Clears the node's value.

    Raises
      asyncio.CancelledError
      NodeUnavailableError
    """

  async def _read(self) -> bool:
    """
    Updates the node's value.

    There will never be two concurrent calls to this method nor any call when the node is disconnected. The node may however be disconnected during the call, in which it might be cancelled; if not, this method should raise a `NodeUnavailableError` upon reaching a disconnection error.

    Returns
      `True` if the node's value has changed, `False` otherwise.

    Raises
      asyncio.CancelledError
      NodeUnavailableError: If the node is unavailable, for instance if it disconnects while its value is being fetched.
      NotImplementedError: If the node is not readable.
    """

    raise NotImplementedError

  async def _write(self, value: T | NullType, /):
    """
    Writes the node's value.

    Raises
      asyncio.CancelledError
      NodeUnavailableError
      NotImplementedError: If the node is not writable.
    """

    raise NotImplementedError

  @abstractmethod
  async def _export_spec(self) -> Any:
    ...

  @abstractmethod
  async def _export_value(self, value: T, /) -> Any:
    ...

  # Called by the consumer

  def claim(self, marker: Optional[Any] = None, *, force: bool = False):
    if not self.writable:
      raise NotImplementedError

    # Create the writer here to ensure it is done during or after initialization
    if not self.writer:
      self.writer = NodeValueWriter(self)

    return self.claimable.claim(marker, force=force)

  async def read(self):
    """
    Updates the node's value.

    Returns
      A boolean indicating whether the node's value could be updated.

    Raises
      asyncio.CancelledError
      NotImplementedError
    """

    if not self.readable:
      raise NotImplementedError

    async with self._read_lock:
      if self.connected:
        try:
          changed = await self._read()
        except NodeUnavailableError:
          pass
        else:
          if changed:
            self._revision = NodeRevision(self._revision + 1)
            self._trigger_listeners(mode='value')

          self._trigger_listeners(mode='content')

          return True

    return False

  def watch_content(self, listener: NodeListener, /):
    return self._attach_listener(listener, mode='content')

  def watch_ownership(self, listener: NodeListener, /):
    if not self.writable:
      raise NotImplementedError

    return self._attach_listener(listener, mode='ownership')

  def watch_target(self, listener: NodeListener, /):
    if not self.writable:
      raise NotImplementedError

    return self._attach_listener(listener, mode='target')

  def export(self):
    return {
      **super().export(),
      "spec": self._export_spec(),
      "value": {
        "nullable": self.nullable,
        "readable": self.readable,
        "writable": self.writable
      }
    }

  def export_value(self, value: Optional[T | NullType], /):
    match value:
      case None:
        return None
      case NullType():
        return {
          "type": "null"
        }
      case _:
        return {
          "type": "default",
          "value": self._export_value(value)
        }


class NodeValueWriter(Generic[T]):
  def __init__(self, node: ValueNode[T]):
    self.node = node

    # outer None -> target value is implicitly undefined (= never called write())
    # inner None -> target value is explicitly undefined (= don't care)
    self.target_value: Optional[tuple[float, Optional[T | NullType]]] = None

    self._change_event = Event()
    self._settle_event = DualEvent()

    self.node._pool.start_soon(self._worker())

  async def wait_settled(self):
    await self._settle_event.wait_set()

  async def wait_unsettled(self):
    await self._settle_event.wait_unset()

  def set(self, value: T | NullType, /):
    self.target_value = (time.time(), value)
    self._change_event.set()

  async def _worker(self):
    from .watcher import WatchableNode

    if isinstance(self, WatchableNode) and (not self.node.stable):
      def listener(node: BaseNode, *, mode: NodeListenerMode):
        self._change_event.set()

      reg = await self.watch_value(listener)
    else:
      reg = None

    try:
      while True:
        await self._change_event.wait()
        self._change_event.clear()

        if (self.target_value is not None) and ((target_value := self.target_value[1]) is not None):
          self._settle_event.unset()
          await self.node._write(target_value)
        else:
          await self.node._clear()

        self._settle_event.set()
    finally:
      if reg:
        reg.cancel()

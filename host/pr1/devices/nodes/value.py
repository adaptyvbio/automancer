import time
from abc import ABC, abstractmethod
from asyncio import Event, Future, Lock
from enum import IntEnum
from typing import Any, Awaitable, Generic, Optional, TypeVar, final

from ...util.asyncio import DualEvent, race
from ...util.pool import Pool
from ..claim import Claimable
from .common import BaseNode, NodeListener, NodeUnavailableError


@final
class NullType:
  pass

Null = NullType()


T = TypeVar('T')

class ValueNode(BaseNode, ABC, Generic[T]):
  def __init__(
      self,
      *,
      nullable: bool = False,
      readable: bool = False,
      writable: bool = False
    ):
    """
    Creates a value node.

    Parameters
      nullable: Whether the node's value can be set to a disabled state known as `Null`.
      readable: Whether the node is readable.
      writable: Whether the node is writable.
    """

    super().__init__()

    self._pool: Pool

    # None -> value is unknown
    self.value: Optional[tuple[float, T | NullType]] = None

    self.nullable = nullable
    self.readable = readable
    self.writable = writable

    if self.readable:
      self._read_lock = Lock()

    if self.writable:
      self.claimable = Claimable(change_callback=self._claim_change)
      self._writer: Optional[NodeValueWriter] = None

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

  async def _read(self) -> None:
    """
    Updates the node's value.

    There will never be two concurrent calls to this method nor any call when the node is disconnected. The node may however be disconnected during the call, in which it might be cancelled; if not, this method should raise a `NodeUnavailableError` upon reaching a disconnection error.

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

  async def _set_value_at_half_time(self, coro: Awaitable[T], /):
    time_before = time.time()
    value = await coro
    time_after = time.time()

    self.value = ((time_before + time_after) * 0.5, value)

  def claim(self, marker: Optional[Any] = None, *, force: bool = False):
    if not self.writable:
      raise NotImplementedError

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
        old_value = self.value

        try:
          await self._read()
        except NodeUnavailableError:
          pass
        else:
          if self.value != old_value:
            self._trigger_listeners(mode='value')
          # self._trigger_listeners(mode='content')

          return True

    return False

  async def start(self):
    async with Pool.open() as pool:
      self._pool = pool

      if self.writable:
        self.writer = NodeValueWriter(self)

      await Future()

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
      "nullable": self.nullable,
      "readable": self.readable,
      "writable": self.writable
    }

  def export_value(self, value: Optional[T | NullType], /) -> object:
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
          "innerValue": self._export_value(value)
        }


class NodeValueWriterError(IntEnum):
  Disconnected = 0

class NodeValueWriter(Generic[T]):
  def __init__(self, node: ValueNode[T]):
    self.node = node

    self.error: Optional[NodeValueWriterError] = None

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

  def set(self, value: Optional[T | NullType], /):
    self.target_value = (time.time(), value)
    self._change_event.set()

    self.node._trigger_listeners(mode='target')

  async def _worker(self):
    from .watcher import Watcher

    async with Watcher([self.node], modes={'connection', 'value'}) as watcher:
      while True:
        await race(
          watcher.wait_event(),
          self._change_event.wait()
        )

        # print("Event", self.node, self.node.id, self.node.connected, self.target_value, self.node.value)

        self._change_event.clear()

        if self.node.connected:
          try:
            if (self.target_value is not None) and ((target_value := self.target_value[1]) is not None):
              if (not self.node.value) or (target_value != self.node.value[1]):
                self._settle_event.unset()
                await self.node._write(target_value)

                # Not sure whether to keep this or move it to plugins
                self.node.value = (time.time(), target_value)
                self.node._trigger_listeners(mode='value')

              self.error = None
            else:
              await self.node._clear()
              self.error = None
          except NodeUnavailableError:
            self.error = NodeValueWriterError.Disconnected
        else:
          self.error = NodeValueWriterError.Disconnected

        self._settle_event.set()


__all__ = [
  'NodeValueWriter',
  'NodeValueWriterError',
  'Null',
  'NullType',
  'ValueNode'
]

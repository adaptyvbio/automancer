from abc import ABC
from asyncio import Lock
from typing import Any, Generic, NewType, Optional, TypeVar, final

from ...util.asyncio import Cancelable
from ...fiber.expr import export_value
from ..claim import Claimable
from .common import ConfigurableNode, NodeListener, NodeUnavailableError, configure


@final
class NullType:
  pass

Null = NullType()


T = TypeVar('T')

NodeRevision = NewType('NodeRevision', int)

class ValueNode(ConfigurableNode, ABC, Generic[T]):
  def __init__(self, *, nullable: bool = False, readable: bool = False, writable: bool = False):
    super().__init__()

    self._lock = Lock()
    self._revision = NodeRevision(0)

    self.target_value: Optional[T | NullType] = None
    self.value: Optional[T | NullType] = None

    self.nullable = nullable
    self.readable = readable
    self.writable = writable

    if self.writable:
      self.claimable = Claimable(change_callback=self._claim_change)
      self._ownership_listeners = set[NodeListener]()

  # Internal

  def _claim_change(self):
    for listener in self._ownership_listeners:
      listener(self)

  # To be implemented

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

  async def _write(self, value: Optional[T | NullType], /):
    """
    Writes the node's value.

    Raises
      asyncio.CancelledError
      NodeUnavailableError
      NotImplementedError: If the node is not writable.
    """

    raise NotImplementedError

  # @abstractmethod
  async def _export_spec(self) -> Any:
    pass

  # @abstractmethod
  async def _export_value(self, value: T, /) -> Any:
    pass

  # Called by the producer

  async def _configure(self):
    async with configure(super()):
      try:
        await self._read()
      except NotImplementedError:
        pass

      while (self.target_value is not None) and (self.value != self.target_value):
        async with self._lock:
          await self._write(self.target_value)
          self.value = self.target_value

  # Called by the consumer

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

    async with self._lock:
      if self.connected:
        try:
          changed = await self._read()
        except NodeUnavailableError:
          pass
        else:
          if changed:
            self._revision = NodeRevision(self._revision + 1)

          return True

    return False

  def watch_ownership(self, listener: NodeListener, /):
    if not self.writable:
      raise NotImplementedError

    self._ownership_listeners.add(listener)

    def cancel():
      self._ownership_listeners.remove(listener)

    return Cancelable(cancel)

  async def write(self, value: Optional[T | NullType], /):
    from .readable import SubscribableReadableNode

    self.target_value = value

    async with self._lock:
      if self.connected:
        try:
          await self._write(value)
        except NodeUnavailableError:
          pass
        else:
          self.value = self.target_value

          if isinstance(self, SubscribableReadableNode):
            self._trigger()

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

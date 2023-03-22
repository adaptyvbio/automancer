from abc import abstractmethod
from typing import Generic, Optional, TypeVar

from ..claim import Claimable
from .common import NodeUnavailableError
from .value import ValueNode


T = TypeVar('T')

class WritableNode(ValueNode, Claimable, Generic[T]):
  """
  A configurable writable node.

  Attributes
    current_value: The node's last known value. This is `None` (1) when `_read()` is not implemented and the node has never been written to and connected or (2) when the node has always been disconnected.
    target_value: The node's target value. This is `None` when the target value is deactivation or when undefined (i.e. the user doesn't care about the node's value).
  """

  def __init__(self):
    ValueNode.__init__(self)
    Claimable.__init__(self)

    self._target_value: Optional[T] = None

  # To be implemented

  @abstractmethod
  def _target_reached(self) -> bool:
    ...

  # Overriden when inheriting from ReadableNode
  def _read(self):
    raise NotImplementedError

  @abstractmethod
  async def _write(self, value: T, /):
    """
    Writes the node's value.

    Raises
      asyncio.CancelledError
      NodeUnavailableError
    """

  # Called by the producer

  async def _configure(self):
    try:
      await self._read()
    except NodeUnavailableError:
      return
    except NotImplementedError:
      pass

    if not self._target_reached():
      await self._try_write(self._target_value)

  async def _unconfigure(self):
    self.connected = False
    self._trigger_connection_listeners()

  # Called by the consumer

  async def _try_write(self, value: Optional[T], /):
    self._target_value = value

    if value is not None:
      async with self._lock:
        if self.connected:
          try:
            await self._write(value)
          except NodeUnavailableError:
            pass

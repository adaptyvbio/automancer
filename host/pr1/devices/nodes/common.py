from abc import ABC, abstractmethod
from asyncio import Protocol
import contextlib
from typing import NewType, Optional, Sequence

from ...util.asyncio import AsyncCancelable
from ...util.types import SimpleCallbackFunction


NodeId = NewType('NodeId', str)
NodePath = tuple[NodeId, ...]
NodePathLike = Sequence[NodeId]


# Base nodes

class NodeUnavailableError(Exception):
  pass

class BaseNode(ABC):
  def __init__(self):
    self.connected: bool
    self.id: NodeId

    self.description: Optional[str] = None
    self.icon: Optional[str] = None
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
    return (f"{self.label} ({self.id})" if self.label else str(self.id)) + f" \x1b[92m{self.__class__.__module__}.{self.__class__.__qualname__}\x1b[0m"

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


class ConfigurableNode(BaseNode, ABC):
  def __init__(self):
    super().__init__()
    self.connected = False

  async def _configure(self) -> None:
    pass

  async def _unconfigure(self) -> None:
    pass

  async def __aenter__(self):
    if isinstance(self, ConfigurableNode):
      async with configure(self):
        self.connected = True

  async def __aexit__(self, exc_name, exc, exc_type):
    self.connected = False

    async with unconfigure(self):
      pass


@contextlib.asynccontextmanager
async def configure(node: BaseNode, /):
  if isinstance(node, ConfigurableNode):
    try:
      await node._configure()
      yield
    except:
      await node._unconfigure()
      raise
  else:
    yield

@contextlib.asynccontextmanager
async def unconfigure(node: BaseNode, /):
  try:
    yield
  finally:
    if isinstance(node, ConfigurableNode) and node.connected:
      await node._unconfigure()

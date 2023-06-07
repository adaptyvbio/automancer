from abc import ABC
from typing import Literal, NewType, Optional, Protocol, Sequence, TypeVar

from ...util.asyncio import Cancelable, DualEvent
from ...util.misc import HierarchyNode


NodeId = NewType('NodeId', str)
NodePath = tuple[NodeId, ...]
NodePathLike = Sequence[NodeId]


T = TypeVar('T', bound='BaseNode', contravariant=True)
NodeListenerMode = Literal['connection', 'ownership', 'target', 'value']

class NodeListener(Protocol[T]):
  def __call__(self, node: T, *, mode: NodeListenerMode):
    ...


# Base nodes

class NodeUnavailableError(Exception):
  pass

class BaseNode(HierarchyNode, ABC):
  def __init__(self):
    self.id: NodeId

    self.description: Optional[str] = None
    self.icon: Optional[str] = None
    self.label: Optional[str] = None

    self._connected_event = DualEvent()
    self._listeners = dict[NodeListenerMode, list[NodeListener]]()

  # Internal

  def __get_node_name__(self):
    return (f"[{self.id}]" + (f" {self.label}" if self.label else str())) + f" \x1b[92m{self.__class__.__module__}.{self.__class__.__qualname__}\x1b[0m"

  def __hash__(self):
    return id(self)

  # Called by the producer

  @property
  def _label(self):
    return f"'{self.label or self.id}'"

  def _attach_listener(self, listener: NodeListener, *, mode: NodeListenerMode):
    if not mode in self._listeners:
      self._listeners[mode] = list()

    self._listeners[mode].append(listener)

    def cancel():
      self._listeners[mode].remove(listener)

    return Cancelable(cancel)

  def _trigger_listeners(self, *, mode: NodeListenerMode):
    # TODO: Trigger a 'content' event when receiving a 'value' event

    if (listeners := self._listeners.get(mode)):
      for listener in listeners:
        listener(self, mode=mode)

  # Called by the consumer

  @property
  def connected(self):
    return self._connected_event.is_set()

  @connected.setter
  def connected(self, value: bool, /):
    was_connected = self.connected
    self._connected_event.toggle(value)

    if value != was_connected:
      self._trigger_listeners(mode='connection')

  def export(self):
    return {
      "id": self.id,
      "connected": self.connected,
      "description": self.description,
      "icon": self.icon,
      "label": self.label
    }

  def iter_all(self):
    yield (NodePath([self.id]), self)

  async def wait_connected(self):
    await self._connected_event.wait_set()

  async def wait_disconnected(self):
    await self._connected_event.wait_unset()

  def watch_connection(self, listener: NodeListener, /):
    """
    Watches the node's connection status for changes.

    Parameters
      listener: A callback called after the node's connection status changes, but not immediately after calling this function. The node's connection status is not provided by the callback but can be obtained using `connected`.

    Returns
      An `AsyncCancelable` which can be used stop watching the node.
    """

    return self._attach_listener(listener, mode='connection')


__all__ = [
  'BaseNode',
  'NodeUnavailableError',
  'NodeId',
  'NodePath',
  'NodePathLike',
  'NodeListener',
  'NodeListenerMode'
]

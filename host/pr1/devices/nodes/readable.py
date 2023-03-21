import asyncio
import warnings
from abc import abstractmethod
from asyncio import Event, Handle, Task
from typing import AsyncIterator, Callable, NewType, Optional, Sequence

from ...util.asyncio import AsyncCancelable
from .common import NodeUnavailableError
from .value import ValueNode


ReadableNodeRevision = NewType('ReadableNodeRevision', int)
WatchableNodeListener = Callable[['WatchableNode'], None]


class ReadableNode(ValueNode):
  def __init__(self):
    ValueNode.__init__(self)
    self._revision = ReadableNodeRevision(0)

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

  # Called by the consumer

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


class WatchableNode(ReadableNode):
  @abstractmethod
  async def watch_value(self, listener: WatchableNodeListener, /) -> AsyncCancelable:
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
  async def watch_values(nodes: 'Sequence[WatchableNode]', listener: 'Callable[[set[WatchableNode]], None]'):
    """
    Watches multiple nodes for value changes.

    See `watch_value()` for details.
    """

    callback_handle: Optional[Handle] = None
    changed_nodes = set[WatchableNode]()
    ready = False

    def node_listener(node: WatchableNode):
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


class BooleanReadableNode(ReadableNode):
  def __init__(self):
    super().__init__()
    self.value: Optional[bool] = None

  def export(self):
    return {
      **super().export(),
      "readable": {
        "type": "boolean",
        "value": self.value
      }
    }


class SubscribableReadableNode(WatchableNode):
  """
  A readable node whose changes can be reported by the node's implementation.
  """

  def __init__(self):
    super().__init__()

    self._value_listeners = set[WatchableNodeListener]()

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

  async def _unconfigure(self):
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

class PollableReadableNode(SubscribableReadableNode):
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

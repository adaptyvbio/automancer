import asyncio
import warnings
from abc import abstractmethod
from asyncio import Event, Handle, Task
from typing import AsyncIterator, Callable, NewType, Optional, Sequence

from ...util.asyncio import AsyncCancelable, Cancelable, cancel_task, run_double
from ...util.types import SimpleCallbackFunction
from .common import (ConfigurableNode, NodeListener, NodeUnavailableError,
                     configure, unconfigure)
from .value import NodeRevision, ValueNode


class WatchableNode(ValueNode):
  @abstractmethod
  async def watch_value(self, listener: NodeListener, /) -> Cancelable:
    """
    Watches the node by fetching its value at a regular interval.

    Returns once the node has been updated, although possibly while remaining disconnected and with a null value. Calling this method twice with the same `listener` (as defined by `__hash__()`) has the same effect as calling it once.

    Parameters
      interval: The maximal delay after which `listener` is called if a change occured immediately after its last call. Ignored if the node can report changes to its value.
      listener: A callback called when the node's value changes, but not immediately after calling this function and never before the latter returns. The node's value is not provided by the callback but can obtained using `value`.

    Returns
      An `AsyncCancelable` which can be used to stop watching the node.
    """


class SubscribableReadableNode(WatchableNode, ConfigurableNode):
  """
  A readable node whose changes can be reported by the node's implementation.
  """

  def __init__(self, **kwargs):
    super().__init__(**kwargs)

    self._watch_canceled = False
    self._watch_count = 0
    self._watch_task: Optional[Task[None]] = None
    self._watching_event = Event()

  # Internal

  async def _watch(self):
    try:
      while True:
        try:
          if not self.connected:
            self._watching_event.set()

          await self.wait_connected()

          try:
            async for _ in self._subscribe():
              self._watching_event.set()
              self._trigger_listeners(mode='value')
          except NodeUnavailableError:
            pass
          else:
            warnings.warn("Subscription ended unexpectedly")
        except asyncio.CancelledError:
          if self._watch_canceled and (self._watch_count > 0):
            self._watch_canceled = False
          else:
            raise
    finally:
      self._watch_task = None
      self._watching_event.clear()

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

  # Called by the consumer

  async def watch_value(self, listener, /):
    reg = self._attach_listener(listener, mode='value')
    self._watch_count += 1

    if not self._watch_task:
      self._watch_task = self._pool.start_soon(self._watch())

    def cancel():
      assert self._watch_task
      self._watch_task.cancel()

      self._watch_canceled = True
      self._watch_count -= 1

      reg.cancel()

    try:
      await self._watching_event.wait()
    except asyncio.CancelledError:
      cancel()
      raise

    return Cancelable(cancel)


class PollableReadableNode(SubscribableReadableNode):
  """
  A readable node which whose changes can only be detected by polling.
  """

  def __init__(self, *, interval: float = 1.0, **kwargs):
    """
    Parameters
      min_interval: The minimal delay, in seconds, to wait between two calls to `_read()`.
    """

    super().__init__(**kwargs)
    self._interval = interval

  # Internal

  async def _subscribe(self):
    last_revision: Optional[NodeRevision] = None

    while True:
      if not await self.read():
        raise NodeUnavailableError

      if self._revision != last_revision:
        last_revision = self._revision
        yield

      await asyncio.sleep(self._interval)

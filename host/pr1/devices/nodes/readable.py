import asyncio
import time
import warnings
from abc import abstractmethod
from asyncio import Event
from typing import AsyncIterator, Optional

from ...util.asyncio import Cancelable
from ...util.pool import TaskHandle
from .common import NodeListener, NodeUnavailableError
from .value import ValueNode


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


class SubscribableReadableNode(WatchableNode):
  """
  A readable node whose changes can be reported by the node's implementation.
  """

  def __init__(self, **kwargs):
    super().__init__(**kwargs)

    self._watch_count = 0
    self._watch_handle: Optional[TaskHandle] = None
    self._watching_event = Event()

  # Internal

  def _start_watch(self, reg: Cancelable):
    self._watch_count += 1

    if not self._watch_handle:
      self._watch_handle = self._pool.start_soon_with_handle(self._watch())

    def cancel():
      self._watch_count -= 1

      # print("Interrupting", self._watch_count, self._watch_handle)

      # The _watch_handle property could already have been set to None if an error occured in _watch().
      if self._watch_handle and (self._watch_count < 1):
        self._watch_handle.interrupt()

      reg.cancel()

    return Cancelable(cancel)


  async def _watch(self):
    try:
      while True:
        if not self.connected:
          self._watching_event.set()

        await self.wait_connected()

        try:
          async for _ in self._subscribe():
            # Listeners are called by _subscribe().
            self._watching_event.set()
        except NodeUnavailableError:
          pass
        else:
          warnings.warn("Subscription ended unexpectedly")
    finally:
      self._watch_handle = None
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

  def watch_content(self, listener, /):
    reg = super().watch_content(listener)
    return self._start_watch(reg)

  async def watch_value(self, listener, /):
    reg = self._attach_listener(listener, mode='value')
    new_reg = self._start_watch(reg)

    try:
      await self._watching_event.wait()
    except asyncio.CancelledError:
      new_reg.cancel()
      raise

    return new_reg


class PollableReadableNode(SubscribableReadableNode):
  """
  A readable node which whose changes can only be detected by polling.
  """

  def __init__(self, *, poll_interval: float = 1.0, **kwargs):
    """
    Parameters
      min_interval: The minimal delay, in seconds, to wait between two calls to `_read()`.
    """

    super().__init__(**kwargs)
    self.__poll_interval = poll_interval

  # Internal

  async def _subscribe(self):
    while True:
      before_time = time.time()

      if not await self.read():
        await self.wait_disconnected()
        raise NodeUnavailableError

      yield

      delay = self.__poll_interval - (time.time() - before_time)

      if delay > 0:
        await asyncio.sleep(delay)


class StableReadableNode(SubscribableReadableNode):
  async def _subscribe(self):
    await self.read()
    yield

    await self.wait_disconnected()
    raise NodeUnavailableError


__all__ = [
  'PollableReadableNode',
  'StableReadableNode',
  'SubscribableReadableNode',
  'WatchableNode'
]

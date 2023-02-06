import asyncio
from asyncio import Future
from queue import Queue
from threading import Thread
import traceback
from typing import Any, Awaitable, Callable, Generic, Literal, Optional, TypeVar


T = TypeVar('T')
S = TypeVar('S')

class AsyncIteratorThread(Generic[T, S]):
  def __init__(self, handler: Callable[[Callable[[S], None]], T], /):
    self._handler = handler
    self._queue = Queue()
    self._result: Optional[Any] = None
    self._thread = Thread(target=self._run)
    self._thread.start()

  def _callback(self, arg: S, /):
    self._queue.put((False, arg))

  def _run(self):
    try:
      self._result = (True, self._handler(self._callback))
    except Exception as e:
      self._result = (False, e)

    self._queue.put((True, None))

  def result(self) -> T:
    assert self._result is not None

    success, value = self._result

    if success:
      return value
    else:
      raise value

  def __aiter__(self):
    return self

  async def __anext__(self) -> S:
    loop = asyncio.get_event_loop()
    done, value = await loop.run_in_executor(None, lambda: self._queue.get(block=True))

    if done:
      self._thread.join()
      raise StopAsyncIteration

    return value


class Lock:
  def __init__(self):
    self._counter = 0
    self._unlock_future: Optional[Future[None]] = None

  @property
  def locked(self):
    return self._counter > 0

  def lock(self):
    self._counter += 1

  def unlock(self):
    assert self._counter > 0
    self._counter -= 1

    if self._counter < 1:
      if self._unlock_future:
        self._unlock_future.set_result(None)
        self._unlock_future = None

  def __enter__(self):
    self.lock()

  def __exit__(self, exc_type, exc_value, traceback):
    self.unlock()

  async def acquire(self):
    if self.locked:
      if not self._unlock_future:
        self._unlock_future = Future()

      await self._unlock_future


def run_anonymous(awaitable: Awaitable, /):
  async def func():
    try:
      await awaitable
    except Exception:
      traceback.print_exc()

  return asyncio.create_task(func())

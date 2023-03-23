import asyncio
from asyncio import Event, Future, Task
from dataclasses import dataclass
from queue import Queue
import sys
from threading import Thread
import traceback
from typing import Any, Awaitable, Callable, Coroutine, Generic, Optional, TypeVar


@dataclass
class AsyncCancelable:
  cancel: Callable[[], Awaitable[None]]


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


class DualEvent:
  def __init__(self):
    self._set_event = asyncio.Event()
    self._unset_event = asyncio.Event()

  def is_set(self):
    return self._set_event.is_set()

  def set(self):
    self._set_event.set()
    self._unset_event.clear()

  def unset(self):
    self._set_event.clear()
    self._unset_event.set()

  async def wait_set(self):
    await self._set_event.wait()

  async def wait_unset(self):
    await self._unset_event.wait()


async def cancel_task(task: Optional[Task], /):
  """
  Silently cancels the provided task, if any.

  Parameters
    task: The task to cancel, or `None`.
  """

  if task:
    task.cancel()

    try:
      await task
    except asyncio.CancelledError:
      pass


def run_anonymous(awaitable: Awaitable, /):
  call_trace = traceback.extract_stack()

  async def func():
    try:
      await awaitable
    except Exception as exc:
      exc_trace = traceback.extract_tb(exc.__traceback__)

      for line in traceback.StackSummary(call_trace[:-1] + exc_trace).format():
        print(line, end=str(), file=sys.stderr)

      print(f"{exc.__class__.__name__}: {exc}", file=sys.stderr)

  return asyncio.create_task(func())


async def run_double(func: Callable[[Callable[[], None]], Coroutine[Any, Any, T]], /) -> Task[T]:
  ready_event = Event()
  task = asyncio.create_task(func(ready_event.set))

  try:
    await ready_event.wait()
  except asyncio.CancelledError:
    task.cancel()
    await task

  return task

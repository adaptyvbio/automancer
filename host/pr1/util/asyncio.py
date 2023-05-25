import asyncio
import sys
import traceback
from asyncio import Future, Task
from dataclasses import dataclass
from queue import Queue
from threading import Thread
from typing import (Any, Awaitable, Callable, Coroutine, Generic, Iterable,
                    Optional, Sequence, TypeVar, cast)

from .types import SimpleAsyncCallbackFunction, SimpleCallbackFunction


@dataclass
class Cancelable:
  cancel: SimpleCallbackFunction

@dataclass
class AsyncCancelable:
  cancel: SimpleAsyncCallbackFunction


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
    done, value = await asyncio.to_thread(lambda: self._queue.get(block=True))

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

  def toggle(self, value: bool, /):
    if value:
      self.set()
    else:
      self.unset()

  async def wait_set(self):
    await self._set_event.wait()

  async def wait_unset(self):
    await self._unset_event.wait()


def aexit_handler(func: Callable[[Any], Awaitable[None]], /):
  async def new_func(self, exc_type, exc_value, traceback):
    exceptions = list[BaseException]()

    if exc_type:
      exceptions.append(exc_value)

    try:
      await func(self)
    except BaseException as e:
      exceptions.append(e)

    if len(exceptions) > 1:
      raise BaseExceptionGroup("Asynchronous exit handler", exceptions) from None
    elif exceptions:
      raise exceptions[0] from None

  return new_func


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
      task.uncancel()


async def race(*awaitables: Awaitable):
  tasks = [asyncio.ensure_future(awaitable) for awaitable in awaitables]

  try:
    done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
  except asyncio.CancelledError:
    for task in tasks:
      task.cancel()

    await asyncio.wait(tasks)
    raise

  done_task = next(iter(done))

  for task in pending:
    task.cancel()

  if pending:
    await asyncio.wait(pending)

  return tasks.index(done_task), done_task.result()


U = TypeVar('U', AsyncCancelable, Cancelable)

async def register_all(awaitables: Sequence[Awaitable[U]], /):
  tasks = [asyncio.ensure_future(awaitable) for awaitable in awaitables]

  try:
    await wait_all(tasks)
  except (asyncio.CancelledError, Exception):
    for task in tasks:
      reg = task.result()

      match reg:
        case AsyncCancelable():
          await reg.cancel()
        case Cancelable():
          reg.cancel()

    raise

  return [task.result() for task in tasks]


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


async def run_double(func: Callable[[Callable[[], bool]], Coroutine[Any, Any, T]], /) -> Task[T]:
  future = Future[None]()

  def ready():
    if not future.done():
      future.set_result(None)
      return True
    else:
      return False

  async def inner_func():
    try:
      return await func(ready)
    except BaseException as e:
      if not future.done():
        future.set_exception(e)
      else:
        raise

  task = asyncio.create_task(inner_func())

  try:
    await future
  except asyncio.CancelledError:
    task.cancel()
    await future

  return cast(Task[T], task)


async def shield(awaitable: Awaitable[T], /) -> T:
  task = asyncio.ensure_future(awaitable)

  try:
    return await asyncio.shield(task)
  except asyncio.CancelledError:
    await task
    raise


async def try_all(items: Iterable[Coroutine[Any, Any, Any] | Task[Any]], /):
  """
  Wait for all provided coroutines or tasks to complete.

  If an exception is raised by a task, all other tasks are cancelled and the exception is re-raised, along with any other exception that has been raised during cancellation.

  Raises
    BaseExceptionGroup: If multiple exceptions were raised.
    BaseException: If a single exception was raised.
    asyncio.CancelledError: If the coroutine was cancelled and no exception was raised.
  """

  if not items:
    return

  cancelled_exc: Optional[asyncio.CancelledError] = None
  tasks = [item if isinstance(item, Task) else asyncio.create_task(item) for item in items]

  try:
    await asyncio.wait(tasks, return_when=asyncio.FIRST_EXCEPTION)
  except asyncio.CancelledError as e:
    cancelled_exc = e

    for task in tasks:
      task.cancel()

  await wait_all(tasks)

  if cancelled_exc:
    raise cancelled_exc


async def wait_all(items: Iterable[Coroutine[Any, Any, Any] | Task[Any]], /):
  """
  Waits for all provided coroutines or tasks to complete.

  Raises
    BaseExceptionGroup: If multiple exceptions were raised.
    BaseException: If a single exception was raised.
    asyncio.CancelledError: If the coroutine was cancelled and no exception was raised.
  """

  if not items:
    return

  cancelled_exc: Optional[asyncio.CancelledError] = None
  tasks = [item if isinstance(item, Task) else asyncio.create_task(item) for item in items]

  while True:
    try:
      await asyncio.wait(tasks)
    except asyncio.CancelledError as e:
      cancelled_exc = e

      for task in tasks:
        task.cancel()
    else:
      break

  exceptions = [exc for task in tasks if (exc := task.exception())]

  if len(exceptions) >= 2:
    raise BaseExceptionGroup("ExceptionGroup", exceptions)
  elif exceptions:
    raise exceptions[0]

  if cancelled_exc:
    raise cancelled_exc



if __name__ == "__main__":
  import contextlib

  @contextlib.asynccontextmanager
  async def timeout(delay):
    task = asyncio.current_task()
    assert task

    async def timeout_coro():
      await asyncio.sleep(delay)
      task.cancel()

    timeout_task = asyncio.create_task(timeout_coro())

    yield
    await cancel_task(timeout_task)

  async def main():
    async with timeout(10):
      try:
        await asyncio.sleep(2)
      except asyncio.CancelledError:
        print("Cancelled")
      else:
        print("Done")

  asyncio.run(main())

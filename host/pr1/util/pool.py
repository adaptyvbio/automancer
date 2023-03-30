import asyncio
from asyncio import Future, Task
from contextlib import AbstractAsyncContextManager
import contextlib
from dataclasses import dataclass
from typing import Any, Coroutine, Optional, Sequence, TypeVar


# class NurseryManager:
#   def open_nursery(self):
#     return NurseryContextManager()

# class NurseryContextManager(AbstractAsyncContextManager):
#   def __init__(self):
#     self._nursery: Optional[Nursery] = None

#   async def __aenter__(self):
#     self._nursery = Nursery()
#     return self._nursery

#   async def __aexit__(self, exc_type, exc_val, exc_tb):
#     assert self._nursery
#     self._nursery._closed = False

#     try:
#       await self._nursery.wait()
#     finally:
#       self._nursery = None

# class PoolExceptionGroup(ExceptionGroup):
#   pass

PoolExceptionGroup = BaseExceptionGroup


T = TypeVar('T')

class Pool:
  """
  An object used to manage tasks created in a common context.
  """

  def __init__(self):
    self._tasks = set[Task]()

  def __len__(self):
    return len(self._tasks)

  def _done_callback(self, task: Task):
    self._tasks.remove(task)

    try:
      exc = task.exception()
    except asyncio.CancelledError:
      pass
    else:
      if exc:
        self.close()

  def add(self, task: Task[Any]):
    """
    Adds a new task to the pool.
    """

    task.add_done_callback(self._done_callback)
    self._tasks.add(task)

    async def ret():
      try:
        return await task
      except Exception:
        raise asyncio.CancelledError from None

    return asyncio.create_task(ret())

  async def cancel(self):
    """
    Cancels all tasks currently in the pool and waits for all tasks to finish, including those that might be added during cancellation.
    """

    self.close()
    await self.wait()

  def close(self):
    """
    Cancels all tasks currently in the pool.

    Calling this function multiple times will increment the cancellation counter of tasks already in the pool, and cancel newly-added tasks.
    """

    for task in self._tasks:
      task.cancel()

  async def wait(self):
    """
    Waits for all tasks in the pool to finish, including those that might be added later.

    Cancelling this function will cancel all tasks in the pool.

    Raises
      asyncio.CancelledError
      PoolExceptionGroup
    """

    cancelled = False
    exceptions = list[BaseException]()

    while (tasks := self._tasks.copy()):
      try:
        await asyncio.wait(tasks)
      except asyncio.CancelledError:
        cancelled = True
        self.close()

      for task in tasks:
        if task.done():
          try:
            exc = task.exception()
          except asyncio.CancelledError:
            pass
          else:
            if exc:
              exceptions.append(exc)

    if len(exceptions) >= 2:
      raise PoolExceptionGroup("Pool error", exceptions)
    if exceptions:
      raise exceptions[0]

    if cancelled:
      raise asyncio.CancelledError

  def start_soon(self, coro: Coroutine[Any, Any, T], /) -> Task[T]:
    """
    Creates a task from the provided coroutine and adds it to the pool.
    """

    task = asyncio.create_task(coro)
    self.add(task)
    return task

  @classmethod
  @contextlib.asynccontextmanager
  async def open(cls, *, forever: bool = False):
    """
    Creates an asynchronous context with a dedicated pool.

    The context will not return until all tasks in the pool have finished.

    Parameters
      forever: Whether the pool should stay open once all tasks have finished.
    """

    pool = cls()
    exception: Optional[Exception] = None
    wait_task = asyncio.create_task(pool.wait())

    if forever:
      async def wait_forever():
        await asyncio.Future()

      pool.start_soon(wait_forever())

    try:
      yield pool
    except asyncio.CancelledError:
      pool.close()
    except Exception as exc:
      pool.close()
      exception = exc

    try:
      await wait_task
    except Exception as exc:
      if exception:
        raise PoolExceptionGroup("Context manager error", [exc, exception]) from None
      else:
        raise exc from None

    if exception:
      raise exception


if __name__ == "__main__":
  async def sleep(delay: float):
    try:
      await asyncio.sleep(delay)
    except asyncio.CancelledError:
      pass

    raise Exception('I\'m first')

  async def five():
    async with Pool.open() as pool:
      for i in range(5):
        pool.start_soon(sleep(i + 1))


  async def main():
    async with Pool.open() as pool:
      # pool.start_soon(sleep(0.2))
      pool.start_soon(five())
      await asyncio.sleep(0.1)
      raise Exception('aa')
      # pool.start_soon(sleep(0.2))

  asyncio.run(main())

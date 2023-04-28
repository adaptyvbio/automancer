import asyncio
from asyncio import Event, Task
import contextlib
from typing import Any, Coroutine, Optional, TypeVar


PoolExceptionGroup = BaseExceptionGroup


T = TypeVar('T')

class Pool:
  """
  An object used to manage tasks created in a common context.
  """

  def __init__(self, *, open: bool = False):
    self._closing = False
    self._open = False
    self._preopen = open
    self._task_event = Event()
    self._tasks = set[Task]()

  def __len__(self):
    return len(self._tasks)

  def _done_callback(self, task: Task):
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

    if (not self._open) and not (self._preopen):
      raise Exception("Pool not open")

    task.add_done_callback(self._done_callback)

    self._task_event.set()
    self._tasks.add(task)

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

    self._closing = True

    for task in self._tasks:
      task.cancel()

    # Used as a signal to wake up wait() and have it return
    self._task_event.set()

  def wait(self, *, forever: bool = False):
    """
    Waits for all tasks in the pool to finish, including those that might be added later.

    Cancelling this function will cancel all tasks in the pool.

    Raises
      asyncio.CancelledError
      PoolExceptionGroup
    """

    if self._open:
      raise Exception("Pool already open")

    self._open = True
    return self._wait(forever=forever)

  async def _wait(self, *, forever: bool):
    cancelled = False

    exceptions = list[BaseException]()

    while True:
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

            self._tasks.remove(task)

      if forever and (not cancelled) and (not self._closing) and (not exceptions):
        self._task_event.clear()

        try:
          await self._task_event.wait()
        except asyncio.CancelledError:
          cancelled = True
          break

        # Used as a signal to stop the loop
        if not self._tasks:
          break
      else:
        break

    self._open = False

    if len(exceptions) >= 2:
      raise PoolExceptionGroup("Pool error", exceptions)
    if exceptions:
      raise exceptions[0]

    if cancelled:
      raise asyncio.CancelledError

  def start_soon(self, coro: Coroutine[Any, Any, T], /, *, critical: bool = False) -> Task[T]:
    """
    Creates a task from the provided coroutine and adds it to the pool.

    Parameters:
      coro: The coroutine to be started soon.
      critical: Whether to close the pool when this task finishes.
    """

    if (not self._open) and not (self._preopen):
      raise Exception("Pool not open")

    task = asyncio.create_task(coro)
    self.add(task)

    if critical:
      def callback(task: Task[T]):
        try:
          task.result()
        except:
          pass
        else:
          self.close()

      task.add_done_callback(callback)

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
    wait_task = asyncio.create_task(pool.wait(forever=forever))

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

import asyncio
import contextlib
from asyncio import Event, Future, Task
from dataclasses import dataclass
from traceback import FrameSummary
import traceback
from typing import Any, AsyncGenerator, Coroutine, Optional, Self, Sequence, TypeVar
from weakref import WeakKeyDictionary

from .asyncio import race
from .misc import HierarchyNode


T = TypeVar('T')


PoolExceptionGroup = BaseExceptionGroup


pools_by_task = dict[Task[None], 'Pool']()

@dataclass
class PoolTaskInfo:
  priority: int
  frame: Optional[FrameSummary]
  pool: 'Optional[Pool]' = None

class Pool(HierarchyNode):
  """
  An object used to manage tasks created in a common context.
  """

  def __init__(self, name: Optional[str] = None, *, open: bool = False):
    self._closing_priority: Optional[int] = None
    self._open = False
    self._name = name
    self._preopen = open
    self._task_event = Event()
    self._tasks = dict[Task[None], PoolTaskInfo]()

  def __get_node_name__(self):
    return self._name or "Pool"

  def __get_node_children__(self):
    for task, task_info in self._tasks.items():
      if task_info.pool:
        yield task_info.pool
      else:
        yield [
          f"{task.get_name()}" + (f" (priority={task_info.priority})" if task_info.priority != 0 else str()),
          *([f"Source: {frame.name}() in {frame.filename}" + (f":{frame.lineno}" if frame.lineno is not None else str())] if (frame := task_info.frame) else [])
        ]


  def __len__(self):
    return len(self._tasks)

  def __repr__(self):
    return f"{self.__class__.__name__}" + (f"(name={self._name!r})" if self._name else "()")

  def add(self, task: Task[Any], *, frame_skip: int = 0, priority: int = 0):
    """
    Adds a new task to the pool.
    """

    if (not self._open) and not (self._preopen):
      raise Exception("Pool not open")

    self._tasks[task] = PoolTaskInfo(
      priority=priority,
      frame=traceback.extract_stack(limit=(2 + frame_skip))[0]
    )

    pools_by_task[task] = self

    # Wake up the wait() loop if necessary
    self._task_event.set()

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

    if self._tasks:
      self._closing_priority = self._max_priority()

      for task, task_info in self._tasks.items():
        if task_info.priority >= self._closing_priority:
          task.cancel()
    else:
      self._closing_priority = 0

      # Wake up wait() and have it return
      self._task_event.set()

  def create_child(self):
    """
    Creates a child pool.
    """

    pool = self.__class__()
    self.start_soon(pool.wait())

    return pool

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

  def _max_priority(self):
    return max(task_info.priority for task_info in self._tasks.values())

  async def _wait(self, *, forever: bool):
    # current_pool = self.current()

    # current_task = asyncio.current_task()
    # assert current_task

    # if current_pool:
    #   current_pool._tasks[current_task].pool = self

    cancelled = False
    exceptions = list[BaseException]()

    while True:
      self._task_event.clear()

      try:
        await race(
          self._task_event.wait(),
          *([asyncio.wait(self._tasks, return_when=asyncio.FIRST_COMPLETED)] if self._tasks else list())
        )
      except asyncio.CancelledError:
        # Reached when the call to wait() is cancelled
        cancelled = True
        self.close()

      for task in list(self._tasks.keys()):
        if task.done():
          try:
            exc = task.exception()
          except asyncio.CancelledError:
            pass
          else:
            if exc:
              exceptions.append(exc)

          del self._tasks[task]
          del pools_by_task[task]

      if (exceptions and (self._closing_priority is None)) or (self._tasks and (self._closing_priority is not None) and (self._max_priority() < self._closing_priority)):
        self.close()

      if (not self._tasks) and ((not forever) or (self._closing_priority is not None)):
        break

    self._open = False

    # if current_pool:
    #   current_pool._tasks[current_task].pool = None

    if len(exceptions) >= 2:
      raise PoolExceptionGroup("Pool error", exceptions) from None
    if exceptions:
      raise exceptions[0] from None

    if cancelled:
      raise asyncio.CancelledError

  def start_soon(self, coro: Coroutine[Any, Any, T], /, *, critical: bool = False, frame_skip: int = 0, priority: int = 0) -> Task[T]:
    """
    Creates a task from the provided coroutine and adds it to the pool.

    Parameters:
      coro: The coroutine to be started soon.
      critical: Whether to close the pool when this task finishes.
    """

    if (not self._open) and (not self._preopen):
      raise Exception("Pool not open")

    task = asyncio.create_task(coro)
    self.add(task, frame_skip=(frame_skip + 1), priority=priority)

    if critical:
      def callback(task: Task[T]):
        try:
          task.result()
        except:
          pass
        else:
          if self._closing_priority is None:
            self.close()

      task.add_done_callback(callback)

    return task

  async def wait_until_ready(self, coro: AsyncGenerator[Any, None], /):
    ready_event = Event()

    async def wrapper_coro():
      coro_iter = aiter(coro)

      try:
        await anext(coro_iter)
      except StopAsyncIteration:
        raise Exception("Coroutine did not yield")

      ready_event.set()

      try:
        await anext(coro_iter)
      except StopAsyncIteration:
        pass
      else:
        raise Exception("Coroutine did not stop after first yield")

    self.start_soon(wrapper_coro(), frame_skip=1)
    await ready_event.wait()

  def start_soon_with_handle(self, coro: Coroutine[Any, Any, Any], /):
    if (not self._open) and (not self._preopen):
      raise Exception("Pool not open")

    inner_task = asyncio.create_task(coro)
    handle = TaskHandle(inner_task)

    async def outer_func():
      cancelled = False

      while True:
        try:
          await asyncio.shield(inner_task)
        except asyncio.CancelledError:
          if inner_task.cancelled():
            return

          if (not handle.interrupted()) or cancelled:
            inner_task.cancel()

          cancelled = True

    self.start_soon(outer_func())

    return handle

  @staticmethod
  def current():
    current_task = asyncio.current_task()
    return current_task and pools_by_task.get(current_task)

  @classmethod
  @contextlib.asynccontextmanager
  async def open(cls, name: Optional[str] = None, *, forever: bool = False):
    """
    Creates an asynchronous context with a dedicated pool.

    The context will not return until all tasks in the pool have finished.

    Parameters
      forever: Whether the pool should stay open once all tasks have finished.
    """

    current_task = asyncio.current_task()
    assert current_task

    pool = cls(name)
    current_task_future = Future[None]()
    wait_task = asyncio.create_task(pool.wait(forever=forever))

    async def current_task_handler():
      while True:
        try:
          await asyncio.shield(current_task_future)
        except asyncio.CancelledError:
          current_task.cancel()
        else:
          if current_task_future.done():
            break

    pool.start_soon(current_task_handler(), frame_skip=2)

    # current_task_old_pool = pools_by_task.get(current_task)
    # pools_by_task[current_task] = pool

    try:
      yield pool
    except asyncio.CancelledError:
      pool.close()
    except BaseException as e:
      current_task_future.set_exception(e)
    else:
      current_task_future.set_result(None)

    # del pools_by_task[wait_task]

    # if current_task_old_pool is not None:
    #   pools_by_task[current_task] = current_task_old_pool
    # else:
    #   del pools_by_task[current_task]

    await wait_task

@dataclass
class TaskHandle:
  task: Task

  def interrupt(self):
    if not self.interrupted():
      self.task.cancel()

  def interrupted(self):
    return self.task.cancelling() > 0


if __name__ == "__main__":
  pool: Pool

  async def low():
    try:
      await asyncio.Future()
    finally:
      print("Low")
      await asyncio.sleep(0.1)
      print("Low done")

  async def high():
    try:
      await asyncio.Future()
    finally:
      print("High")
      await asyncio.sleep(0.1)
      print("High done")

  async def sleep(delay):
    try:
      print("Sleeping")
      await asyncio.sleep(delay)
      print("Slept")
    except asyncio.CancelledError:
      print("Aborting sleep")

  # async def b():
  #   await asyncio.sleep(0.1)
  #   print(pool.format_hierarchy())

  # async def a():
  #   async with Pool.open("Inner pool") as pool2:
  #     pool2.start_soon(high(), priority=10)
  #     pool2.start_soon(low())
  #     pool.close()

  async def main():
    global pool

    async with Pool.open("Outer pool") as pool1:
      pool1.start_soon(high(), priority=10)
      pool1.start_soon(low())

      print(pool1.format_hierarchy())

      await asyncio.sleep(0.1)
      pool1.close()

  try:
    asyncio.run(main())
  except KeyboardInterrupt:
    pass

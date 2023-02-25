import asyncio
from asyncio import Task
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
  def __init__(self):
    self._closed = False
    self._tasks = set[Task]()

  def __len__(self):
    return len(self._tasks)

  def start_soon(self, coro: Coroutine[Any, Any, T], /) -> Task[T]:
    assert not self._closed

    task = asyncio.create_task(coro)
    self._tasks.add(task)

    return task

  async def wait(self):
    exceptions = list[BaseException]()

    while (tasks := self._tasks.copy()):
      self._tasks.clear()

      for task in tasks:
        task.cancel()

      await asyncio.wait(tasks)

      for task in tasks:
        try:
          exc = task.exception()
        except asyncio.CancelledError:
          pass
        else:
          if exc:
            exceptions.append(exc)

    if exceptions:
      raise PoolExceptionGroup("Pool error", exceptions)

  @classmethod
  @contextlib.asynccontextmanager
  async def open(cls):
    pool = cls()
    exceptions = list[BaseException]()

    try:
      yield pool
    except Exception as exc:
      # TODO: Cancel pool here
      exceptions.append(exc)
    finally:
      pool._closed = False

      try:
        await pool.wait()
      except PoolExceptionGroup as exc:
        exceptions.append(exc)

    if exceptions:
      raise PoolExceptionGroup("Pool error", exceptions) from None


if __name__ == "__main__":
  async def sleep(delay: float):
    await asyncio.sleep(delay)
    raise Exception('I\'m first')

  async def five():
    async with Pool.open() as pool:
      for i in range(5):
        pool.start_soon(sleep(i + 1))


  async def main():
    async with Pool.open() as pool:
      pool.start_soon(sleep(1.2))
      pool.start_soon(five())
      # pool.start_soon(sleep(0.6))

      raise Exception('Baz')

  asyncio.run(main())

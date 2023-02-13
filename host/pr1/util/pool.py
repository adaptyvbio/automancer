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

@dataclass
class ExceptionGroup(BaseException):
  exceptions: list[BaseException]

class PoolExceptionGroup(ExceptionGroup):
  pass


T = TypeVar('T')

class Pool:
  def __init__(self):
    self._closed = False
    self._tasks = set[Task]()

  def start_soon(self, coro: Coroutine[Any, Any, T], /) -> Task[T]:
    assert not self._closed

    task = asyncio.create_task(coro)
    self._tasks.add(task)

    return task

  async def wait1(self):
    exceptions = list[BaseException]()

    while (tasks := self._tasks):
      self._tasks.clear()
      await asyncio.wait(tasks)

      for task in tasks:
        if exc := task.exception():
          exceptions.append(exc)

    if exceptions:
      raise ExceptionGroup(exceptions)

  async def wait(self):
    exceptions = list[BaseException]()

    while (tasks := self._tasks.copy()):
      self._tasks.clear()
      _, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_EXCEPTION)

      for task in pending:
        task.cancel()

      if pending:
        await asyncio.wait(pending)

      for task in tasks:
        try:
          exc = task.exception()
        except asyncio.CancelledError:
          pass
        else:
          if exc:
            exceptions.append(exc)

    if exceptions:
      raise PoolExceptionGroup(exceptions)

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
      raise ExceptionGroup(exceptions) from None


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

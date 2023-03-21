# Batch workers

from asyncio import Task
import asyncio
from typing import Awaitable, Callable, Generic, Optional, TypeVar


K = TypeVar('K')
R = TypeVar('R')

class BatchWorker(Generic[K, R]):
  def __init__(self, commit: Callable[[list[K]], Awaitable[list[R]]]):
    self._commit = commit
    self._items = list[K]()
    self._items_count = 0
    self._task: Optional[Task[list[R]]] = None
    self._task_items_count: Optional[int] = None

  async def _run_commit(self):
    items = self._items.copy()
    self._items.clear()
    self._task_items_count = len(items)

    try:
      return await self._commit(items)
    finally:
      self._task = None
      self._task_items_count = None

      if self._items:
        self._task = asyncio.create_task(self._run_commit())

  async def write(self, item: K, /):
    index = len(self._items)
    self._items.append(item)

    if not self._task:
      self._task = asyncio.create_task(self._run_commit())

    try:
      results = await asyncio.shield(self._task)
    except asyncio.CancelledError:
      if self._task_items_count is not None:
        self._task_items_count -= 1

        if self._task_items_count < 1:
          self._task.cancel()
          await self._task

      raise
    else:
      return results[index]


if __name__ == "__main__":
  def add(a):
    return asyncio.create_task(_add(a))

  async def _add(a):
    try:
      x = await a
    except BaseException as e:
      print("Done with exception:", repr(e))
    else:
      print("Done with value:", x)

  async def commit(items):
    print(items)
    await asyncio.sleep(1)
    return items

  async def par():
    await asyncio.sleep(0.5)
    # a.cancel()
    b.cancel()

  cluster = BatchWorker(commit)

  async def main():
    global a, b, x

    asyncio.create_task(par())

    a = add(cluster.write('a'))
    b = add(cluster.write('b'))

    # x = await asyncio.gather(a, b)

    await b

    # print('->', x)
    # print('->', await cluster.write('c', 6))

  asyncio.run(main())

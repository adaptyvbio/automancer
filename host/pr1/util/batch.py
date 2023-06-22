# Batch workers

import asyncio
from asyncio import Event, Future
from logging import Logger
from typing import Awaitable, Callable, Generic, TypeVar

from ..host import logger as parent_logger
from .asyncio import race
from .decorators import provide_logger


K = TypeVar('K')
R = TypeVar('R')


@provide_logger(parent_logger)
class BatchWorker(Generic[K, R]):
  """
  A utility class to batch an operation.

  Batched items are pushed to the batch queue. using `write()`. If there is no batch currently being committed, all items in the batch queue are committed by providing a list to the committer function. If all writes are cancelled, the committer function is not called, or cancelled if is already running. The committer function returns a list of results, which are returned to the corresponding `write()` calls.
  """

  def __init__(self, commit: Callable[[list[K]], Awaitable[list[R]]]):
    self._commit = commit

    self._futures = dict[int, Future[R]]()
    self._items = dict[int, K]()
    self._next_item_index = 0
    self._write_event = Event()

    self._logger: Logger

  async def start(self):
    while True:
      await self._write_event.wait()
      self._write_event.clear()

      indices = list(self._items.keys())
      items = list(self._items.values())
      self._items.clear()

      self._logger.debug(f"Committing {items} items")

      futures = [self._futures[index] for index in indices]

      end_index, results = await race(
        self._commit(items),
        asyncio.wait(futures)
      )

      if end_index == 0:
        self._logger.debug('Committed')

        for index, result in zip(indices, results):
          future = self._futures.get(index)

          if future:
            future.set_result(result)

  async def write(self, item: K, /):
    self._logger.debug(f"Write request: {item}")

    item_index = self._next_item_index
    self._next_item_index += 1

    self._items[item_index] = item
    self._write_event.set()

    future = Future[R]()
    self._futures[item_index] = future

    try:
      return await future
    except asyncio.CancelledError:
      # If not being written yet
      if item_index in self._items:
        del self._items[item_index]

      raise
    finally:
      del self._futures[item_index]


if __name__ == "__main__":
  async def writer(items: list[int]):
    try:
      print("Write", items)
      await asyncio.sleep(1)

      print("Done", [item * 2 for item in items])
      return [item * 2 for item in items]
    except asyncio.CancelledError:
      print("Cancelled")
      raise

  def run(item: int):
    async def t():
      result = await worker.write(item)
      print("Result", item, "->", result)

    return asyncio.create_task(t())

  worker = BatchWorker(writer)

  async def main():
    asyncio.create_task(worker.start())

    # run(2)
    t = run(3)
    s = run(4)
    t.cancel()
    s.cancel()
    await asyncio.sleep(0.001)
    run(5)
    run(6)

    await asyncio.sleep(3)
    print(worker._items)
    print(worker._futures)

  asyncio.run(main())

from asyncio import CancelledError, Future, Task
from typing import AsyncIterator, Generic, Optional, TypeVar
import asyncio


T = TypeVar('T')

class DynamicParallelIterator(Generic[T]):
  def __init__(self, iterators: list[AsyncIterator[T]]):
    self._cancelled = False
    self._future: Optional[Future] = None
    self._iterators: list[Optional[AsyncIterator[T]]] = iterators # type: ignore
    self._queue: list[tuple[int, T]] = list()
    self._tasks: list[Optional[Task]] = [None] * len(iterators)

  def _callback(self, index: int, task: Task):
    self._tasks[index] = None

    try:
      result = task.result()
    except (CancelledError, StopAsyncIteration):
      self._iterators[index] = None

      if not self._cancelled:
        print("Warning: iterator stopped unexpectedly")

      if self._future and self._cancelled and all(task is None for task in self._tasks):
        self._future.set_exception(StopAsyncIteration)
    else:
      value = (index, result)

      if self._future:
        self._future.set_result(value)
        self._future = None
      else:
        self._queue.append(value)

  def _create_tasks(self):
    for index, iterator in enumerate(self._iterators):
      if iterator and (not self._tasks[index]):
        task = asyncio.create_task(anext(iterator)) # type: ignore
        task.add_done_callback(lambda task, index = index: self._callback(index, task))

        self._tasks[index] = task

  def cancel(self):
    self._create_tasks()
    self._cancelled = True

    for task in self._tasks:
      if task:
        task.cancel()

  def __aiter__(self) -> AsyncIterator[tuple[int, T]]:
    return self

  async def __anext__(self):
    if self._queue:
      return self._queue.pop(0)

    if self._cancelled and all(iterator is None for iterator in self._iterators):
      raise StopAsyncIteration

    self._create_tasks()
    self._future = Future()

    try:
      return await self._future
    except CancelledError:
      self.cancel()
      self._future = None

      raise


if __name__ == '__main__':
  async def main():
    async def a():
      yield 3
      yield 4

    async def b():
      try:
        yield 5
        yield 6
      except CancelledError:
        yield 7
        raise

    it = DynamicParallelIterator[int]([a(), b()])

    async for s in it:
      print("received", s)
      if input("stop?") == "y":
        it.cancel()

    print("terminated")

  asyncio.run(main())

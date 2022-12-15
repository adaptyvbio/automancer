from asyncio import CancelledError, Future, Task
from typing import Any, AsyncIterator, Generic, Literal, Optional, TypeVar, cast
import asyncio
import warnings


T = TypeVar('T')
S = TypeVar('S')


class DynamicParallelIterator(Generic[T]):
  def __init__(self, iterators: list[AsyncIterator[T]]):
    self._cancelled = False
    self._future: Optional[Future] = None
    self._iterators: list[Optional[AsyncIterator[T]]] = iterators # type: ignore
    self._querying = False
    self._queue: list[tuple[int, T]] = list()
    self._tasks: list[Optional[Task]] = [None] * len(iterators)

  def _callback(self, index: int, task: Task):
    self._tasks[index] = None

    try:
      result = task.result()
    except (CancelledError, StopAsyncIteration):
      self._iterators[index] = None

      if not self._cancelled:
        warnings.warn(f"[{type(self).__name__}] Iterator {index} stopped unexpectedly")

      if self._future and self._cancelled and all(task is None for task in self._tasks):
        self._future.set_exception(StopAsyncIteration)
    else:
      value = (index, result)

      if self._future:
        self._future.set_result(value)
        self._future = None
      elif not self._querying:
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

  async def get_all(self):
    assert not self._cancelled
    assert not self._querying
    assert not self._queue
    assert not self._future

    self._querying = True
    self._create_tasks()

    tasks = cast(list[Task], self._tasks.copy())
    await asyncio.wait(tasks)

    def transform_task(task: Task):
      try:
        return task.result()
      except (CancelledError, StopAsyncIteration):
        return None

    self._querying = False
    return [transform_task(task) for task in tasks]

  def __aiter__(self) -> AsyncIterator[tuple[int, T]]:
    return self

  async def __anext__(self):
    assert not self._querying

    if self._queue:
      return self._queue.pop(0)

    if self._cancelled and all(iterator is None for iterator in self._iterators):
      raise StopAsyncIteration

    self._create_tasks()
    self._future = Future()

    try:
      return await self._future
    except CancelledError:
      self._future = asyncio.Future()
      self.cancel()
      return await self._future


class CoupledStateIterator(Generic[T, S]):
  def __init__(self, main_iterator: AsyncIterator):
    self._open_future: Optional[Future] = Future()
    self._reset = False
    self._state_iterator: Optional[AsyncIterator] = None
    self._task: Optional[Task] = None
    self._trigger_future = Future()
    self._wait_future: Optional[Future] = Future()

    async def primary_iterator():
      async for event in main_iterator:
        yield event

        if self._open_future:
          await self._open_future

      self._iterator.cancel()

      # TODO: Remove?
      try:
        await asyncio.Future()
      except CancelledError:
        raise

    async def secondary_iterator():
      while True:
        if self._wait_future:
          await self._wait_future

        assert self._state_iterator

        try:
          while True:
            self._task = asyncio.create_task(anext(self._state_iterator)) # type: ignore
            event = await self._task
            self._task = None

            yield event
        except (asyncio.CancelledError, StopAsyncIteration):
          self._state_iterator = None
          self._task = None
          self._wait_future = asyncio.Future()

          if self._iterator._cancelled:
            break
          else:
            yield None

    async def tertiary_iterator():
      while True:
        await self._trigger_future
        yield

        self._trigger_future = Future()

    self._iterator = DynamicParallelIterator[Any]([
      primary_iterator(),
      secondary_iterator(),
      tertiary_iterator()
    ])

    self._primary_value: T
    self._secondary_value: Optional[S]

  def close_state(self):
    self._open_future = asyncio.Future()

    if self._task:
      self._task.cancel()

  def set_state(self, iterator: AsyncIterator):
    assert self._open_future
    assert self._wait_future

    self._reset = True
    self._state_iterator = iterator

    self._open_future.set_result(None)
    self._open_future = None

    self._wait_future.set_result(None)
    self._wait_future = None

    self.trigger()

  def trigger(self):
    self._trigger_future.set_result(None)

  async def __aiter__(self) -> AsyncIterator[tuple[T, Optional[S]]]:
    while True:
      if self._reset:
        self._reset = False

        self._primary_value, self._secondary_value, _ = cast(tuple[T, S, Any], await self._iterator.get_all())
        yield self._primary_value, self._secondary_value

      async for index, value in self._iterator:
        match index:
          case 0: self._primary_value = cast(T, value)
          case 1: self._secondary_value = cast(S, value)

        yield self._primary_value, self._secondary_value

        if self._reset:
          break
      else:
        break


class CoupledStateIterator2(Generic[T, S]):
  def __init__(self, iterator: AsyncIterator[T]):
    self._future: Optional[Future[None]] = None
    self._iterator = iterator
    self._task: Optional[Task[T]] = None
    self._triggered = False

    self._value: Optional[T] = None
    self._state: S

    self._value_queue = list[T]()
    self._state_queue = list[S]()

  def _callback(self, task: Task[T]):
    self._task = None

    try:
      self._value = task.result()
    except StopAsyncIteration:
      assert self._future
      self._future.set_exception(StopAsyncIteration)
    else:
      self._value_queue.append(self._value)

      if self._future:
        self._future.set_result(None)
        self._future = None

  def notify(self, state: S):
    self._state_queue.append(state)

    if self._future:
      self._future.set_result(None)
      self._future = None

  def trigger(self):
    self._triggered = True

    if self._future:
      self._future.set_result(None)
      self._future = None

  def __aiter__(self):
    return self

  async def __anext__(self):
    while True:
      if self._value_queue or self._state_queue or self._triggered:
        self._triggered = None

        if self._value_queue:
          self._value = self._value_queue.pop(0)

        if self._state_queue:
          self._state = self._state_queue.pop(0)

        if self._value:
          return (self._value, self._state)

      if not self._future:
        if not self._task:
          self._task = asyncio.create_task(anext(self._iterator)) # type: ignore
          self._task.add_done_callback(self._callback)

        self._future = Future()
        await self._future


class TriggerableIterator(Generic[T]):
  def __init__(self, iterator: AsyncIterator[T]):
    self._done = False
    self._future: Optional[Future[None]] = None
    self._iterator = iterator
    self._task: Optional[Task[T]] = None
    self._triggered = False
    self._value: Optional[T]

  def _callback(self, task: Task[T]):
    self._task = None

    try:
      self._value = task.result()
    except StopAsyncIteration:
      self._done = True

    if self._future:
      self._future.set_result(None)
      self._future = None

  def trigger(self):
    if self._future:
      self._future.set_result(None)
      self._future = None
    else:
      self._triggered = True

  def __aiter__(self):
    return self

  async def __anext__(self):
    assert not self._done
    assert not self._future

    if self._triggered and (self._value is not None):
      self._triggered = None
      return self._value

    if not self._task:
      self._task = asyncio.create_task(anext(self._iterator)) # type: ignore
      self._task.add_done_callback(self._callback)

    self._future = Future()
    await self._future

    if self._done:
      raise StopAsyncIteration

    assert self._value is not None
    return self._value


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

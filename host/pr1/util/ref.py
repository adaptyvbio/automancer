from asyncio import Future
from typing import Generic, Optional, TypeVar, cast


T = TypeVar('T')

class Ref(Generic[T]):
  def __init__(self, value: Optional[T] = None):
    self.value = value

  @property
  def unwrapped(self) -> T:
    if self._value is None:
      raise ValueError()

    return self._value

  @property
  def value(self):
    return self._value

  @value.setter
  def value(self, value: Optional[T]):
    if (self._value is None) != (value is None):
      raise ValueError()

    self._value = value

    if self._value is None:
      self._future = Future()
    else:
      self._future.set_result(None)
      self._future = None

  async def get_value(self) -> T:
    if self._future is not None:
      await self._future

    return cast(T, self.value)

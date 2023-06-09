import math
from dataclasses import dataclass
from typing import Self


@dataclass(frozen=True)
class DatetimeTerm:
  value: float
  resolution: float = 0.0

  def __add__(self, other: 'DurationTerm | float', /) -> Self:
    match other:
      case DurationTerm(value, resolution):
        return self.__class__(self.value + value, self.resolution + resolution)
      case float():
        return self.__class__(self.value + other, self.resolution)
      case _:
        return NotImplemented

  def export(self):
    if math.isnan(self.value):
      return { "type": "unknown" }

    if math.isinf(self.value):
      return { "type": "forever" }

    return {
      "type": "datetime",
      "value": (self.value * 1000),
      "resolution": (self.resolution * 1000)
    }

  @classmethod
  def unknown(cls):
    return cls(math.nan)


@dataclass(frozen=True, slots=True)
class DurationTerm:
  value: float
  resolution: float = 0.0

  def __add__(self, other: Self | float, /) -> Self:
    match other:
      case DurationTerm(value, resolution):
        return self.__class__(self.value + value, self.resolution + resolution)
      case float():
        return self.__class__(self.value + other, self.resolution)
      case _:
        return NotImplemented

  def __radd__(self, other: Self | float, /):
    return self.__add__(other)

  def __mul__(self, other: float, /):
    return self.__class__(self.value * other, self.resolution * other)

  def __rmul__(self, other: float, /):
    return self.__mul__(other)

  def export(self):
    if math.isnan(self.value):
      return { "type": "unknown" }

    if math.isinf(self.value):
      return { "type": "forever" }

    return {
      "type": "duration",
      "value": (self.value * 1000),
      "resolution": (self.resolution * 1000)
    }

  @classmethod
  def forever(cls):
    return cls(math.inf)

  @classmethod
  def unknown(cls):
    return cls(math.nan)

  @classmethod
  def zero(cls):
    return cls(0.0)


Term = DatetimeTerm | DurationTerm


__all__ = [
  'DatetimeTerm',
  'DurationTerm',
  'Term'
]

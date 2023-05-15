from abc import ABC
import time
from typing import Optional

from pint import Measurement, Quantity, Unit, UnitRegistry

from ...ureg import ureg
from .value import Null, NullType, ValueNode


class NumericNode(ValueNode[Quantity], ABC):
  _ureg: UnitRegistry = ureg

  def __init__(
    self,
    *,
    unit: Optional[Unit | str] = None,
    dtype: str = 'f4',
    max: Optional[Quantity | float] = None,
    min: Optional[Quantity | float] = None,
    **kwargs
  ):
    super().__init__(**kwargs)

    self.dtype = dtype
    self.error: Optional[Quantity] = None
    self.unit: Unit = self._ureg.Unit(unit or 'dimensionless')

    self.max = (max * self.unit) if isinstance(max, float) else max
    self.min = (min * self.unit) if isinstance(min, float) else min

  async def _read(self):
    old_value = self.value
    raw_value = await self._read_value()
    current_time = time.time()

    match raw_value:
      case Quantity():
        self.error = None
        self.value = (current_time, raw_value)
      case Measurement(error=error, value=value):
        self.error = error
        self.value = value
      case float() | int():
        self.value = (current_time, raw_value * self.unit)
      case _:
        raise ValueError("Invalid read value")

    return (old_value is None) or (self.value[1] != old_value[1])

  async def _read_value(self) -> Measurement | Quantity | float | int:
    raise NotImplementedError

  async def write_quantity(self, raw_value: Quantity | NullType | float, /):
    if not isinstance(raw_value, NullType):
      value: Quantity = (raw_value * self.unit) if isinstance(raw_value, float) else raw_value.to(self.unit)

      if not value.check(self.unit):
        raise ValueError("Invalid unit")

      if (self.min is not None) and (value < self.min):
        raise ValueError("Value too small")
      if (self.max is not None) and (value > self.max):
        raise ValueError("Value too large")

      await self.write(value)
    else:
      if not self.nullable:
        raise ValueError("Value not nullable")

      await self.write(Null)

  def _export_spec(self):
    return {
      "type": "numeric",
      "dimensionality": dict(self.unit.dimensionality), # type: ignore
      "unitFormatted": (f"{self.unit:~H}" or None)
    }

  def _export_value(self, value: Quantity, /):
    return {
      "magnitude": value.m_as(self.unit)
    }

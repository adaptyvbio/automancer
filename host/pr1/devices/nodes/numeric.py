from abc import ABC
from typing import Optional

from quantops import Context as QuantityContext
from quantops import Quantity, Unit, UnitRegistry

from ...ureg import ureg
from .value import ValueNode


class NumericNode(ValueNode[Quantity], ABC):
  _ureg: UnitRegistry = ureg

  def __init__(
    self,
    *,
    context: Optional[QuantityContext | str] = None,
    dtype: str = 'f4',
    max: Optional[Quantity] = None,
    min: Optional[Quantity] = None,
    unit: Optional[Unit | str] = None,
    **kwargs
  ):
    super().__init__(**kwargs)

    self.dtype = dtype
    self.unit = self._ureg.parse_unit(unit or "dimensionless")
    self.context = self._ureg.parse_context(context) if context else self.unit.find_context()

    assert self.context.dimensionality == self.unit.dimensionality

    self.max = (max * self.unit) if isinstance(max, float) else max
    self.min = (min * self.unit) if isinstance(min, float) else min

  def _transform_numeric_read(self, raw_value: Quantity | float | int, /):
    match raw_value:
      case Quantity():
        return raw_value
      case float() | int():
        return (raw_value * self.unit)
      case _:
        raise ValueError("Invalid read value")

  # async def write_quantity(self, raw_value: Quantity | NullType | float, /):
  #   if not isinstance(raw_value, NullType):
  #     value: Quantity = (raw_value * self.unit) if isinstance(raw_value, float) else raw_value.to(self.unit)

  #     if not value.check(self.unit):
  #       raise ValueError("Invalid unit")

  #     if (self.min is not None) and (value < self.min):
  #       raise ValueError("Value too small")
  #     if (self.max is not None) and (value > self.max):
  #       raise ValueError("Value too large")

  #     await self.write(value)
  #   else:
  #     if not self.nullable:
  #       raise ValueError("Value not nullable")

  #     await self.write(Null)

  def _export_spec(self):
    return {
      "type": "numeric",
      "context": self.context.serialize_external(),
    }

  def _export_value(self, value: Quantity, /):
    return {
      "magnitude": value.magnitude
    }


__all__ = [
  'NumericNode'
]

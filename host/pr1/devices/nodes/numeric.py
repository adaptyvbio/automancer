from abc import abstractmethod
from typing import Optional

from pint import Measurement, Quantity, Unit, UnitRegistry

from ...fiber.expr import export_value
from ...ureg import ureg
from .readable import ReadableNode
from .value import ValueNode
from .writable import WritableNode


class NumericNode(ValueNode):
  _ureg: UnitRegistry = ureg

  def __init__(
    self,
    *,
    dtype: str = 'f4',
    factor: float = 1.0,
    unit: Optional[Unit | str] = None
  ):
    super().__init__()

    self._factor = factor

    self.dtype = dtype
    self.unit: Unit = self._ureg.Unit(unit or 'dimensionless')


class NumericReadableNode(NumericNode, ReadableNode):
  def __init__(self, **kwargs):
    NumericNode.__init__(self, **kwargs)
    ReadableNode.__init__(self)

    self.error = None
    self.value: Optional[Quantity] = None

  async def _read(self):
    old_value = self.value
    raw_value = await self._read_value()

    match raw_value:
      case Quantity():
        self.error = None
        self.value = raw_value
      case Measurement(error=error, value=value):
        self.error = error
        self.value = value
      case float() | int():
        self.value = raw_value * self._factor * self.unit
      case _:
        raise ValueError("Invalid _read_value() return value")

    return self.value != old_value

  @abstractmethod
  async def _read_value(self) -> Measurement | Quantity | float | int:
    ...

  def export(self):
    return {
      **super().export(),
      "readable": {
        "type": "quantity",
        "error": export_value(self.error) if self.error is not None else None,
        "value": export_value(self.value) if self.value is not None else None
      }
    }


class NumericWritableNode(NumericNode, WritableNode[Optional[float]]):
  _ureg: UnitRegistry = ureg

  def __init__(
    self,
    *,
    deactivatable: bool = False,
    max: Optional[Quantity | float] = None,
    min: Optional[Quantity | float] = None,
    **kwargs
  ):
    NumericNode.__init__(self, **kwargs)

    self.deactivatable = deactivatable

    self.max = (max * self.unit) if isinstance(max, float) else max
    self.min = (min * self.unit) if isinstance(min, float) else min

  # Internal

  def _target_reached(self):
    return isinstance(self, NumericReadableNode) and (self.value is not None) and ((self.value.magnitude / self._factor) == self._target_value)

  # Called by the consumer

  async def write_quantity(self, raw_value: Optional[Quantity | float], /):
    if raw_value is not None:
      value: Quantity = (raw_value * self.unit) if isinstance(raw_value, float) else raw_value.to(self.unit)

      if not value.check(self.unit):
        raise ValueError("Invalid unit")

      if (self.min is not None) and (value < self.min):
        raise ValueError("Value too small")
      if (self.max is not None) and (value > self.max):
        raise ValueError("Value too large")

      await self._try_write(value.magnitude / self._factor)
    else:
      if not self.deactivatable:
        raise ValueError("Value not deactivatable")

      await self._try_write(None)

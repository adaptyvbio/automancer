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
    range: Optional[tuple[Quantity, Quantity]] = None,
    resolution: Optional[Quantity] = None,
    **kwargs
  ):
    super().__init__(**kwargs)

    self.context = self._ureg.get_context(context or "dimensionless")

    assert (not range) or ((range[0].dimensionality == range[1].dimensionality == self.context.dimensionality) and (range[0] < range[1]))
    assert (resolution is None) or (resolution.dimensionality == self.context.dimensionality)

    self.dtype = dtype
    self.range = range
    self.resolution = resolution

  def _export_spec(self):
    return {
      "type": "numeric",
      "context": self.context.serialize_external(),
      "range": [self.range[0].magnitude, self.range[1].magnitude] if self.range else None,
      "resolution": self.resolution.magnitude if self.resolution else None,
    }

  def _export_value(self, value: Quantity, /):
    return {
      "magnitude": value.magnitude
    }


__all__ = [
  'NumericNode'
]

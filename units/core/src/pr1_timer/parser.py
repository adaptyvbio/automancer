from dataclasses import dataclass
from typing import TypedDict
from types import EllipsisType

from pr1.fiber.expr import Evaluable
from pr1.fiber.segment import SegmentTransform
from pr1.fiber import langservice as lang
from pr1.fiber.parser import BaseParser, BlockUnitData
from pr1.reader import LocatedValue
from pr1.util.misc import Exportable


@dataclass
class TimerProcessData(Exportable):
  value: Evaluable[LocatedValue]

  def export(self):
    return { "value": self.value.export() }

class TimerAttributes(TypedDict, total=False):
  wait: Evaluable

class TimerParser(BaseParser):
  namespace = "timer"

  root_attributes = dict()
  segment_attributes = {
    'wait': lang.Attribute(
      decisive=True,
      description="Waits for a fixed delay.",
      type=lang.PotentialExprType(lang.QuantityType('second'))
    )
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def parse_block(self, attrs: TimerAttributes, /, adoption_stack):
    if (attr := attrs.get('wait')):
      analysis, duration = attr.evaluate(adoption_stack)

      if isinstance(duration, EllipsisType):
        return analysis, Ellipsis

      return lang.Analysis(), BlockUnitData(transforms=[SegmentTransform(self.namespace, TimerProcessData(duration))])
    else:
      return lang.Analysis(), BlockUnitData()

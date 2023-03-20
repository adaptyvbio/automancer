from dataclasses import dataclass
from typing import Literal, TypedDict
from types import EllipsisType

from pint import Quantity
from pr1.fiber.eval import EvalContext
from pr1.fiber.expr import Evaluable
from pr1.fiber.segment import SegmentTransform
from pr1.fiber import langservice as lang
from pr1.fiber.parser import BaseParser, BlockUnitData
from pr1.reader import LocatedValue
from pr1.util.misc import Exportable


@dataclass
class TimerProcessData(Exportable):
  duration: Evaluable[LocatedValue[Quantity | Literal['forever']]]

  def export(self):
    return { "duration": self.duration.export() }

class TimerAttributes(TypedDict, total=False):
  wait: Evaluable[LocatedValue[Quantity | Literal['forever']]]

class TimerParser(BaseParser):
  namespace = "timer"

  root_attributes = dict()
  segment_attributes = {
    'wait': lang.Attribute(
      decisive=True,
      description="Waits for a fixed delay.",
      type=lang.PotentialExprType(lang.UnionType(
        lang.EnumType('forever'),
        lang.QuantityType('second')
      ))
    )
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def parse_block(self, attrs: TimerAttributes, /, adoption_stack, trace):
    if (attr := attrs.get('wait')):
      analysis, duration = attr.eval(EvalContext(adoption_stack), final=False)

      if isinstance(duration, EllipsisType):
        return analysis, Ellipsis

      return lang.Analysis(), BlockUnitData(transforms=[SegmentTransform(self.namespace, TimerProcessData(duration))])
    else:
      return lang.Analysis(), BlockUnitData()

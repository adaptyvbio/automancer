from types import EllipsisType

from pr1.fiber.expr import PythonExpr, PythonExprAugmented
from pr1.fiber.segment import SegmentTransform
from pr1.fiber.eval import EvalEnvs, EvalStack
from pr1.fiber import langservice as lang
from pr1.fiber.parser import BaseParser, BlockAttrs, BlockData, BlockUnitData, BlockUnitState
from pr1.draft import DraftGenericError
from pr1.util.decorators import debug


@debug
class TimerProcessData:
  def __init__(self, value: PythonExprAugmented, /):
    self.value = value

  def export(self):
    return { "value": self.value.export() }

class TimerParser(BaseParser):
  namespace = "timer"

  root_attributes = dict()
  segment_attributes = {
    'wait': lang.Attribute(
      decisive=True,
      description="Waits for a fixed delay.",
      type=lang.PotentialExprType(lang.QuantityType('second'), dynamic=True, static=True)
      # type=lang.KVDictType(lang.PotentialExprType(lang.QuantityType('second', allow_nil=True), static=True))
    )
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def parse_block(self, attrs, /, adoption_stack):
    if (attr := attrs.get('wait')):
      return lang.Analysis(), BlockUnitData(transforms=[SegmentTransform(self.namespace, TimerProcessData(34))])

      if isinstance(attr, EllipsisType):
        return lang.Analysis(), Ellipsis

      analysis, eval_result = attr.value.augment(adoption_envs).evaluate(adoption_stack)

      if isinstance(eval_result, EllipsisType):
        return analysis, Ellipsis

      return analysis, BlockUnitData(transforms=[SegmentTransform(self.namespace, TimerProcessData(eval_result.value.augment(runtime_envs)))])
    else:
      return lang.Analysis(), BlockUnitData()

from types import EllipsisType

from pr1.fiber.expr import PythonExpr
from pr1.fiber.segment import SegmentTransform
from pr1.fiber.eval import EvalEnvs, EvalStack
from pr1.fiber import langservice as lang
from pr1.fiber.parser import BaseParser, BlockAttrs, BlockData, BlockUnitData, BlockUnitState
from pr1.draft import DraftGenericError
from pr1.util.decorators import debug


@debug
class TimerProcessData:
  def __init__(self, value: float):
    self._value = value

  def export(self):
    return { "value": self._value }

class TimerParser(BaseParser):
  namespace = "timer"

  root_attributes = dict()
  segment_attributes = {
    'wait': lang.Attribute(
      description="Waits for a fixed delay.",
      optional=True,
      type=lang.LiteralOrExprType(lang.QuantityType('second'), static=True)
    )
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def parse_block(self, block_attrs: BlockAttrs, /, adoption_envs: EvalEnvs, adoption_stack: EvalStack, runtime_envs: EvalEnvs) -> tuple[lang.Analysis, BlockUnitData | EllipsisType]:
    attrs = block_attrs[self.namespace]

    if 'wait' in attrs:
      raw_value = attrs['wait']

      if isinstance(raw_value, EllipsisType):
        return lang.Analysis(), Ellipsis

      if isinstance(raw_value.value, PythonExpr):
        analysis, eval_result = raw_value.value.contextualize(adoption_envs).evaluate(adoption_stack)

        if isinstance(eval_result, EllipsisType):
          return analysis, Ellipsis

        value = eval_result.value
      else:
        analysis = lang.Analysis()
        value = raw_value.value

      value = value.m_as('ms')

      if value < 0:
        return analysis + lang.Analysis(errors=[DraftGenericError("Negative value", ranges=attrs['wait'].area.ranges)]), Ellipsis

      return analysis, BlockUnitData(transforms=[SegmentTransform(self.namespace, TimerProcessData(value))])
    else:
      return lang.Analysis(), BlockUnitData()

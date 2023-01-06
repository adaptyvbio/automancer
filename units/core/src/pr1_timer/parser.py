from types import EllipsisType

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
      type=lang.QuantityType('second')
    )
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def parse_block(self, block_attrs: BlockAttrs, /, adoption_envs: EvalEnvs, adoption_stack: EvalStack, runtime_envs: EvalEnvs) -> tuple[lang.Analysis, BlockUnitData | EllipsisType]:
    attrs = block_attrs[self.namespace]

    if 'wait' in attrs:
      raw_value = attrs['wait']

      if raw_value is Ellipsis:
        return lang.Analysis(), Ellipsis

      value = raw_value.value.m_as('ms')

      if value < 0:
        return lang.Analysis(errors=[DraftGenericError("Negative value", ranges=attrs['wait'].area.ranges)]), Ellipsis

      return lang.Analysis(), BlockUnitData(transforms=[SegmentTransform(self.namespace, TimerProcessData(value))])
    else:
      return lang.Analysis(), BlockUnitData()

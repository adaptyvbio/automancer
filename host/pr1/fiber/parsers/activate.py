from ..expr import PythonExprEvaluator
from .. import langservice as lang
from ..parser import BaseParser, BlockData, BlockUnitState, SegmentTransform
from ...draft import DraftGenericError
from ...util.decorators import debug


@debug
class AcmeState(BlockUnitState):
  process = True

  def __init__(self, value):
    self._value = value

  def export(self):
    return { "value": self._value }

class AcmeParser(BaseParser):
  namespace = "activate"

  root_attributes = dict()
  segment_attributes = {
    'activate': lang.Attribute(
      description="Activates the prototype.",
      optional=True,
      type=lang.QuantityType('meter')
    )
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def enter_protocol(self, data_protocol):
    pass

  def parse_block(self, block_attrs, context):
    attrs = block_attrs[self.namespace]

    if 'activate' in attrs:
      raw_value = attrs['activate']

      if raw_value is Ellipsis:
        return lang.Analysis(), Ellipsis

      value = raw_value.value.m

      if value < 0:
        return lang.Analysis(errors=[DraftGenericError("Negative value", ranges=attrs['activate'].area.ranges)]), Ellipsis

      return lang.Analysis(), BlockData(state=AcmeState(value), transforms=[SegmentTransform(self.namespace)])
    else:
      return lang.Analysis(), BlockData()

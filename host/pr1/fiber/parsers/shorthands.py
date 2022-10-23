from .. import langservice as lang
from ..expr import PythonExprEvaluator
from ..parser import BaseTransform, BlockData, BlockUnitState
from ...units.base import BaseParser
from ...util import schema as sc
from ...util.decorators import debug


class ShorthandsParser(BaseParser):
  namespace = "shorthands"

  root_attributes = {
    'shorthands': lang.Attribute(
      optional=True,
      type=lang.PrimitiveType(dict)
    )
  }

  def __init__(self, fiber):
    self._fiber = fiber
    self._shorthands = dict()

  @property
  def segment_attributes(self):
    return { shorthand_name: lang.Attribute(optional=True, type=lang.AnyType()) for shorthand_name in self._shorthands.keys() }

  def enter_protocol(self, data_protocol):
    for shorthand_name, data_shorthand in data_protocol.get('shorthands', dict()).items():
      self._shorthands[shorthand_name] = data_shorthand

      # self._shorthands[shorthand_name] = self._fiber.parse_block(data_shorthand, None, None)
      # dict_analysis, block_attrs = self.parse_block_attrs(data_block)

    # from pprint import pprint
    # pprint(self._shorthands)

  def parse_block(self, block_attrs, context):
    attrs = block_attrs[self.namespace]

    if attrs:
      return lang.Analysis(), BlockData(transforms=[
        ShorthandTransform(attrs, parser=self)
      ])
    else:
      return lang.Analysis(), BlockData()

  # def parse_block(self, block_attrs, block_state):
  #   state = block_state[self.namespace]

  #   if state:
  #     # new_state = { namespace: (block_state[namespace] or dict()) | (state[namespace] or dict()) for namespace in set(block_state.keys()) | set(state.keys()) }
  #     return self._fiber.parse_part(state)

  #   return None


@debug
class ShorthandTransform(BaseTransform):
  def __init__(self, attrs, parser):
    self._attrs = attrs
    self._parser = parser

  def execute(self, block_state, parent_state, block_transforms):
    state = None
    transforms = list()

    for shorthand_name, shorthand_value in self._attrs.items():
      data_shorthand = self._parser._shorthands[shorthand_name]
      shorthand_state, shorthand_transforms = self._parser._fiber.parse_block(data_shorthand)
      transforms += shorthand_transforms

      if state is not None:
        state = shorthand_state | state
      else:
        state = shorthand_state

    transforms += block_transforms

    return lang.Analysis(), self._parser._fiber.execute(block_state, parent_state | state, transforms)

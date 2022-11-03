from .. import langservice as lang
from ..expr import PythonExpr, PythonExprEvaluator
from ..parser import BaseTransform, BlockData, BlockUnitState
from ..staticeval import EvaluationContext
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
        ShorthandTransform(attrs, context=context, parser=self)
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
  def __init__(self, attrs, *, context, parser):
    self._attrs = attrs
    self._context = context
    self._parser = parser

  def execute(self, block_state, parent_state, block_transforms):
    analysis = lang.Analysis()
    state = None
    transforms = list()

    for shorthand_name, shorthand_value in self._attrs.items():
      data_shorthand = self._parser._shorthands[shorthand_name]

      if isinstance(shorthand_value, str):
        expr_result = PythonExpr.parse(shorthand_value)

        if expr_result:
          expr_analysis, expr_value = expr_result
          analysis += expr_analysis

          if expr_value is Ellipsis:
            return analysis, Ellipsis

          eval_analysis, eval_value = PythonExprEvaluator(expr_value, type=lang.AnyType()).evaluate(self._context)
          analysis += eval_analysis

          if eval_value is Ellipsis:
            return analysis, Ellipsis

          arg = eval_value
        else:
          arg = shorthand_value
      else:
        arg = shorthand_value

      shorthand_context = self._context + EvaluationContext(closure={
        'arg': arg
      })

      parse_result = self._parser._fiber.parse_block(data_shorthand, context=shorthand_context)

      if parse_result is Ellipsis:
        return analysis, Ellipsis

      shorthand_state, shorthand_transforms = parse_result
      transforms += shorthand_transforms

      if state is not None:
        state = shorthand_state | state
      else:
        state = shorthand_state

    transforms += block_transforms

    return analysis, self._parser._fiber.execute(block_state, parent_state | state, transforms)

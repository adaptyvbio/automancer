from typing import Any, Optional

from .. import langservice as lang
from ..eval import EvalEnv
from ..expr import PythonExpr, PythonExprEvaluator
from ..parser import BaseBlock, BaseTransform, BlockData, BlockUnitState, FiberParser
from ...units.base import BaseParser
from ...util import schema as sc
from ...util.decorators import debug


class OpaqueValue:
  def __init__(self, data: Any, /, *, envs: list[EvalEnv], fiber: FiberParser):
    self._data = data
    self._envs = envs
    self._fiber = fiber

    self._block: Any = None # TODO: Improve type
    self._value: Any = None

  def _as_block(self):
    if self._value is not None:
      raise ValueError() # TODO: Add location info

    if not self._block:
      block = self._fiber.parse_block(self._data, envs=self._envs)
      self._block = block.unwrap() if block is not Ellipsis else Ellipsis

    return self._block

  def _as_value(self):
    if self._block is not None:
      raise ValueError()

    # def wrap_value(value):
    #   return OpaqueValue(value, envs=self._envs, fiber=self._fiber) if isinstance(value, (dict, list)) else value

    wrap_value = lambda value: self.wrap(value, envs=self._envs, fiber=self._fiber)

    if self._value is None:
      # TODO: Check for expressions
      match self._data:
        case dict():
          self._value = { key: wrap_value(value) for key, value in self._data.items() }
        case list():
          self._value = [wrap_value(item) for item in self._data]

    return self._value

  # def __getattr__(self, name: str):
  #   return getattr(self._as_value(), name)

  def __getitem__(self, key: str):
    return self._as_value()[key]

  @classmethod
  def wrap(cls, value: Any, /, *, envs: list[EvalEnv], fiber: FiberParser):
    return cls(value, envs=envs, fiber=fiber) if isinstance(value, (dict, list)) else value


class ShorthandEnv(EvalEnv):
  pass

@debug
class ShorthandBlock(BaseBlock):
  def __init__(self, block: BaseBlock, /, env: ShorthandEnv, *, arg):
    self._arg = arg
    self._block = block
    self._env = env

  def linearize(self, context):
    return self._block.linearize(context | { self._env: { 'arg': self._arg } })

  def export(self):
    return self._block.export()


class ShorthandsParser(BaseParser):
  namespace = "shorthands"

  root_attributes = {
    'shorthands': lang.Attribute(
      optional=True,
      type=lang.PrimitiveType(dict)
    )
  }

  def __init__(self, fiber: FiberParser):
    self._fiber = fiber
    self._shorthands = dict()

  @property
  def segment_attributes(self):
    return { shorthand_name: lang.Attribute(optional=True, type=lang.AnyType()) for shorthand_name in self._shorthands.keys() }

  def enter_protocol(self, data_protocol):
    data_shorthands = data_protocol.get('shorthands', dict())

    if data_shorthands is Ellipsis:
      return lang.Analysis()

    for shorthand_name, data_shorthand in data_shorthands.items():
      shorthand_env = ShorthandEnv()

      parse_result = self._fiber.parse_block(data_shorthand, allow_expr=True, envs=[shorthand_env])
      self._shorthands[shorthand_name] = (shorthand_env, parse_result) if parse_result is not Ellipsis else Ellipsis

    return lang.Analysis()

  def parse_block(self, block_attrs, /, context, envs):
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
  def __init__(self, attrs, *, context, parser: ShorthandsParser):
    self._attrs = attrs
    self._context = context
    self._parser = parser

  def execute(self, block_state, parent_state, block_transforms, envs, *, origin_area, stack):
    analysis = lang.Analysis()
    state = None
    transforms = list()

    for shorthand_name, shorthand_value in self._attrs.items():
      shorthand = self._parser._shorthands[shorthand_name]

      if shorthand is Ellipsis:
        return analysis, Ellipsis


      shorthand_env, shorthand_opaque = shorthand

      stack = {
        shorthand_env: { 'arg': OpaqueValue.wrap(shorthand_value, envs=[], fiber=self._parser._fiber) }
      }

      shorthand_analysis, shorthand_result = shorthand_opaque.evaluate(stack)
      analysis += shorthand_analysis

      if shorthand_result is Ellipsis:
        return analysis, Ellipsis

      shorthand_state, shorthand_transforms = shorthand_result
      transforms += shorthand_transforms

      if state is not None:
        state = shorthand_state | state
      else:
        state = shorthand_state

    block = self._parser._fiber.execute(block_state, parent_state | state, transforms + block_transforms, [], origin_area=origin_area, stack=stack)

    if block is Ellipsis:
      return analysis, Ellipsis

    for shorthand_name, shorthand_value in self._attrs.items():
      shorthand = self._parser._shorthands[shorthand_name]
      shorthand_env, _ = shorthand

      block = ShorthandBlock(block, env=shorthand_env, arg=shorthand_value)

    return analysis, block

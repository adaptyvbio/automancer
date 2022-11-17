from types import EllipsisType
from typing import Any, Optional, cast

from ...reader import LocationArea
from ..opaque import OpaqueValue
from ...util import schema as sc
from ...util.decorators import debug
from .. import langservice as lang
from ..eval import EvalEnv, EvalEnvs, EvalStack
from ..expr import PythonExpr, PythonExprEvaluator
from ..parser import BaseBlock, BaseParser, BaseTransform, BlockAttrs, BlockData, BlockState, BlockUnitData, BlockUnitState, FiberParser, Transforms, UnresolvedBlockData


class ShorthandEnv(EvalEnv):
  pass

@debug
class ShorthandBlock(BaseBlock):
  state = None

  def __init__(self, block: BaseBlock, env: ShorthandEnv):
    # self._arg = arg
    self._block = block
    self._env = env

  def linearize(self, context, parent_state):
    return self._block.linearize(context, parent_state)

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
    self._shorthands: dict[str, tuple[ShorthandEnv, UnresolvedBlockData | EllipsisType]] = dict()

  @property
  def segment_attributes(self):
    return { shorthand_name: lang.Attribute(optional=True, type=lang.AnyType()) for shorthand_name in self._shorthands.keys() }

  def enter_protocol(self, data_protocol: BlockAttrs, /, adoption_envs: EvalEnvs, runtime_envs: EvalEnvs):
    data_shorthands = data_protocol.get('shorthands', dict())

    if data_shorthands is Ellipsis:
      return lang.Analysis()

    for shorthand_name, data_shorthand in data_shorthands.items():
      shorthand_env = ShorthandEnv()
      self._shorthands[shorthand_name] = (shorthand_env, self._fiber.parse_block_expr(data_shorthand, adoption_envs=[*adoption_envs, shorthand_env], runtime_envs=[*runtime_envs, shorthand_env]))

    return lang.Analysis()

  def parse_block(self, block_attrs: BlockAttrs, /, adoption_envs: EvalEnvs, adoption_stack: EvalStack, runtime_envs: EvalEnvs) -> tuple[lang.Analysis, BlockUnitData | EllipsisType]:
    attrs = block_attrs[self.namespace]
    analysis = lang.Analysis()

    shorthands_data: list[tuple[str, BlockData]] = list()

    for shorthand_name, shorthand_value in attrs.items():
      if isinstance(shorthand_value, EllipsisType):
        return analysis, Ellipsis

      shorthand_env, shorthand_data = self._shorthands[shorthand_name]

      if isinstance(shorthand_data, EllipsisType):
        return analysis, Ellipsis

      shorthand_adoption_stack: EvalStack = {
        **adoption_stack,
        shorthand_env: {
          'arg': OpaqueValue.wrap(shorthand_value, adoption_envs=adoption_envs, adoption_stack=adoption_stack, runtime_envs=runtime_envs, fiber=self._fiber)
        }
      }

      eval_analysis, eval_data = shorthand_data.evaluate(shorthand_adoption_stack)
      analysis += eval_analysis

      if isinstance(eval_data, EllipsisType):
        return analysis, Ellipsis

      shorthands_data.append((shorthand_name, eval_data))

    if attrs:
      return lang.Analysis(), BlockUnitData(transforms=[
        ShorthandTransform(shorthands_data, parser=self)
      ])
    else:
      return lang.Analysis(), BlockUnitData()


@debug
class ShorthandTransform(BaseTransform):
  def __init__(self, shorthands_data: list[tuple[str, BlockData]], /, parser: ShorthandsParser):
    self._parser = parser
    self._shorthands_data = shorthands_data

  def execute(self, state: BlockState, transforms: Transforms, *, origin_area: LocationArea) -> tuple[lang.Analysis, BaseBlock | EllipsisType]:
    analysis = lang.Analysis()
    block_state: BlockState = cast(BlockState, None)
    block_transforms = list()

    for _, shorthand_data in self._shorthands_data:
      transforms += shorthand_data.transforms

      if block_state is not None:
        block_state = shorthand_data.state | block_state
      else:
        block_state = shorthand_data.state

    block = self._parser._fiber.execute(state | block_state, block_transforms + transforms, origin_area=origin_area)

    if isinstance(block, EllipsisType):
      return analysis, Ellipsis

    for shorthand_name, _ in self._shorthands_data:
      shorthand = self._parser._shorthands[shorthand_name]
      shorthand_env, _ = shorthand

      block = ShorthandBlock(block, env=shorthand_env)

    return analysis, block

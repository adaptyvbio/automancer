from types import EllipsisType
from typing import Any

from .. import langservice as lang
from ..eval import EvalEnv, EvalEnvs, EvalStack
from ..expr import PythonExprEvaluator
from ..parser import BaseParser, BaseTransform, BlockAttrs, BlockData, BlockUnitData, BlockUnitState
from ...util import schema as sc
from ...util.decorators import debug


class RepeatParser(BaseParser):
  namespace = "do"

  root_attributes = dict()
  segment_attributes = {
    'repeat': lang.Attribute(optional=True, type=lang.PrimitiveType(int))
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def parse_block(self, block_attrs: BlockAttrs, /, adoption_envs: EvalEnvs, adoption_stack: EvalStack, runtime_envs: EvalEnvs) -> tuple[lang.Analysis, BlockUnitData | EllipsisType]:
    attrs = block_attrs[self.namespace]

    if 'repeat' in attrs and not isinstance(repeat_attr := attrs['repeat'], EllipsisType):
      env = RepeatEnv()

      return lang.Analysis(), BlockUnitData(
        envs=[env],
        transforms=[RepeatTransform(attrs['repeat'].value, env=env, parser=self)]
      )
    else:
      return lang.Analysis(), BlockUnitData()

@debug
class RepeatTransform(BaseTransform):
  def __init__(self, count: int, *, env: 'RepeatEnv', parser: RepeatParser):
    self._count = count
    self._env = env
    self._parser = parser

  def execute(self, state, parent_state, transforms, envs, *, origin_area, stack):
    block = self._parser._fiber.execute(state, parent_state, transforms, envs, origin_area=origin_area, stack=stack)

    if block is Ellipsis:
      return lang.Analysis(), Ellipsis

    return lang.Analysis(), RepeatBlock(block, count=self._count, env=self._env)

@debug
class RepeatBlock:
  def __init__(self, block, count: int, env: 'RepeatEnv'):
    self._block = block
    self._count = count
    self._env = env

  def linearize(self, context):
    analysis = lang.Analysis()
    output = list()

    for index in range(self._count):
      item_analysis, item = self._block.linearize(context | { self._env: { 'index': index } })
      analysis += item_analysis

      if item is Ellipsis:
        continue

      output += item

    return analysis, output

  def export(self):
    return {
      "type": "repeat",
      "count": self._count,
      "child": self._block.export()
    }

@debug
class RepeatEnv(EvalEnv):
  def __init__(self):
    pass

from typing import Any

from .. import langservice as lang
from ..eval import EvalEnv
from ..expr import PythonExprEvaluator
from ..parser import BaseParser, BaseTransform, BlockData, BlockUnitState
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

  def enter_protocol(self, data_protocol):
    pass

  def parse_block(self, block_attrs, context):
    attrs = block_attrs[self.namespace]
    transforms = list()

    if 'repeat' in attrs:
      transforms.append(RepeatTransform(attrs['repeat'].value, parser=self))

    return lang.Analysis(), BlockData(transforms=transforms)

@debug
class RepeatTransform(BaseTransform):
  def __init__(self, count: int, *, parser: RepeatParser):
    self._count = count
    self._parser = parser

  def execute(self, state, parent_state, transforms, envs):
    env = RepeatEnv()
    block = self._parser._fiber.execute(state, parent_state, transforms, [*envs, env])

    if block is Ellipsis:
      return lang.Analysis(), Ellipsis

    return lang.Analysis(), RepeatBlock(block, count=self._count, env=env)

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

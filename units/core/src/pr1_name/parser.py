from types import EllipsisType
from typing import Optional

from pr1.fiber.eval import EvalEnvs, EvalStack
from pr1.fiber.langservice import Analysis, Attribute, LiteralOrExprType, PrimitiveType
from pr1.fiber.expr import PythonExprEvaluator
from pr1.fiber.parser import BaseParser, BlockAttrs, BlockData, BlockUnitData, BlockUnitState
from pr1.util import schema as sc
from pr1.util.decorators import debug


class NameParser(BaseParser):
  namespace = "name"
  root_attributes = dict()
  segment_attributes = {
    'name': Attribute(
      description="Sets the block's name.",
      optional=True,
      type=LiteralOrExprType(PrimitiveType(str))
    )
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def parse_block(self, block_attrs: BlockAttrs, /, adoption_envs: EvalEnvs, adoption_stack: EvalStack, runtime_envs: EvalEnvs) -> tuple[Analysis, BlockUnitData | EllipsisType]:
    attrs = block_attrs[self.namespace]

    if ('name' in attrs) and not isinstance(name_raw := attrs['name'], EllipsisType):
      if isinstance(name_raw, PythonExprEvaluator):
        name_raw.envs = adoption_envs
        analysis, name = name_raw.evaluate(adoption_stack)

        if isinstance(name, EllipsisType):
          return analysis, BlockUnitData(state=NameState(None))
      else:
        analysis = Analysis()
        name = name_raw

      return analysis, BlockUnitData(state=NameState(name.value))
    else:
      return Analysis(), BlockUnitData(state=NameState(None))


class NameState(BlockUnitState):
  def __init__(self, value: Optional[str], /):
    self.value = value

  def __or__(self, other: 'NameState'):
    return NameState(self.value or other.value)

  def export(self) -> object:
    return { "value": self.value }

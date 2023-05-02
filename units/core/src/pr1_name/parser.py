from dataclasses import dataclass
from types import EllipsisType
from typing import TypedDict

from pr1.fiber.eval import EvalContext
from pr1.fiber.expr import Evaluable
from pr1.fiber.langservice import (Analysis, Attribute, PotentialExprType,
                                   StrType)
from pr1.fiber.parser import (BaseBlock, BaseParser, BasePassiveTransformer,
                              PassiveTransformerPreparationResult,
                              TransformerAdoptionResult)
from pr1.reader import LocatedString

from . import namespace


class Attributes(TypedDict, total=False):
  name: Evaluable[LocatedString]

class Transformer(BasePassiveTransformer):
  priority = 100
  attributes = {
    'name': Attribute(
      description="Sets the block's name.",
      type=PotentialExprType(StrType(), static=True)
    )
  }

  def prepare(self, data: Attributes, /, adoption_envs, runtime_envs):
    if (attr := data.get('name')):
      return Analysis(), PassiveTransformerPreparationResult(attr)
    else:
      return Analysis(), None

  def adopt(self, data: Evaluable[LocatedString], /, adoption_stack, trace):
    analysis, result = data.eval(EvalContext(adoption_stack), final=True)

    if isinstance(result, EllipsisType):
      return analysis, Ellipsis

    return analysis, TransformerAdoptionResult(result)

  def execute(self, data: LocatedString, /, block):
    return Analysis(), NameBlock(block, name=data.value)


class Parser(BaseParser):
  namespace = namespace
  transformers = [Transformer()]


@dataclass
class NameBlock(BaseBlock):
  block: BaseBlock
  name: str

  def export(self):
    return {
      "name": "_",
      "namespace": namespace,

      "child": self.block.export(),
      "value": self.name
    }

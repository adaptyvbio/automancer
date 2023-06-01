from dataclasses import dataclass
from types import EllipsisType
from typing import Any, TypedDict

import pr1 as am
from pr1.fiber.eval import EvalContext
from pr1.fiber.expr import Evaluable
from pr1.input import (Attribute, PotentialExprType,
                                   StrType)
from pr1.fiber.parser import (BaseBlock, BaseParser, BasePassiveTransformer,
                              PassiveTransformerPreparationResult,
                              TransformerAdoptionResult)
from pr1.fiber.transparent import TransparentProgram
from pr1.reader import LocatedString

from . import namespace


class Attributes(TypedDict, total=False):
  name: Evaluable[LocatedString]

class Transformer(BasePassiveTransformer):
  def __init__(self):
    super().__init__({
      'name': Attribute(
        description="Sets the block's name.",
        type=StrType()
      )
    }, priority=800)

  def prepare(self, data: Attributes, /, adoption_envs, runtime_envs):
    if (attr := data.get('name')):
      return am.LanguageServiceAnalysis(), PassiveTransformerPreparationResult(attr)
    else:
      return am.LanguageServiceAnalysis(), None

  def adopt(self, data: Evaluable[LocatedString], /, adoption_stack, trace):
    analysis, result = data.eval(EvalContext(adoption_stack), final=True)

    if isinstance(result, EllipsisType):
      return analysis, Ellipsis

    return analysis, TransformerAdoptionResult(result)

  def execute(self, data: LocatedString, /, block):
    return am.LanguageServiceAnalysis(), NameBlock(block, name=data.value)


class Parser(BaseParser):
  namespace = namespace
  transformers = [Transformer()]


@dataclass
class NameBlock(BaseBlock):
  child: BaseBlock
  name: str

  def create_program(self, handle):
    return TransparentProgram(self.child, handle)

  def import_point(self, data, /):
    return self.child.import_point(data)

  def export(self):
    return {
      "name": "_",
      "namespace": namespace,

      "child": self.child.export(),
      "value": self.name
    }

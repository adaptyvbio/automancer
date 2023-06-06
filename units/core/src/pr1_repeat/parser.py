from dataclasses import dataclass
import math
from types import EllipsisType
from typing import Literal, TypedDict

import pr1 as am
from pr1.eta import export_eta
from pr1.fiber.eval import EvalContext, EvalEnv, EvalEnvValue
from pr1.fiber.expr import Evaluable, EvaluableConstantValue
from pr1.fiber.parser import (BaseBlock, BaseParser, BasePassiveTransformer,
                              PassiveTransformerPreparationResult,
                              TransformerAdoptionResult)
from pr1.reader import LocatedValue

from . import namespace


class Attributes(TypedDict, total=False):
  repeat: Evaluable[LocatedValue[int]]

class Transformer(BasePassiveTransformer):
  priority = 400
  attributes = {
    'repeat': am.Attribute(
      description="Repeats a block a fixed number of times.",
      type=am.AutoExprContextType(am.IntType(mode='positive_or_null'))
    )
  }

  def __init__(self):
    self.env = EvalEnv({
      'index': EvalEnvValue(
        description="The current iteration index.",
        ExprEvalType=(lambda: am.DeferredExprEval(name='index', phase=1)),
      )
    }, name="Repeat", readonly=True)

  def prepare(self, data: Attributes, /, envs):
    if (attr := data.get('repeat')):
      return am.LanguageServiceAnalysis(), PassiveTransformerPreparationResult(attr, envs=[self.env])
    else:
      return am.LanguageServiceAnalysis(), None

  def adopt(self, data: Evaluable[LocatedValue[int | Literal['forever']]], /, adoption_stack, trace):
    analysis, count = data.evaluate_provisional(EvalContext(adoption_stack))

    if isinstance(count, EllipsisType):
      return analysis, Ellipsis

    return analysis, TransformerAdoptionResult(count)

  def execute(self, data: Evaluable[LocatedValue[int | Literal['forever']]], /, block):
    return am.LanguageServiceAnalysis(), Block(block, count=data, env=self.env)

class Parser(BaseParser):
  namespace = namespace
  transformers = [Transformer()]


@dataclass
class Block(BaseBlock):
  block: BaseBlock
  count: Evaluable[LocatedValue[int | Literal['forever']]]
  env: EvalEnv

  def __get_node_children__(self):
    return [self.block]

  def __get_node_name__(self):
    return ["Repeat"]

  def _eta(self):
    match self.count:
      case EvaluableConstantValue(LocatedValue('forever')):
        return math.inf
      case EvaluableConstantValue(LocatedValue(int() as count)):
        return count * self.block.eta()
      case _:
        return math.nan

  def create_program(self, handle):
    from .program import Program
    return Program(self, handle)

  def import_point(self, data, /):
    from .program import ProgramPoint
    return ProgramPoint(
      child=self.block.import_point(data["child"]),
      iteration=data["iteration"]
    )

  def export(self):
    return {
      "name": "_",
      "namespace": namespace,
      "count": self.count.export(),
      "child": self.block.export(),
      "eta": export_eta(self.eta())
    }

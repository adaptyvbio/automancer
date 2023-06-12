from dataclasses import dataclass
from types import EllipsisType
from typing import Literal, TypedDict

import pr1 as am
from pr1.fiber.eval import EvalContext, EvalEnv, EvalEnvValue, EvalSymbol
from pr1.fiber.expr import Evaluable, EvaluableConstantValue
from pr1.fiber.parser import (BaseBlock, BaseParser, BasePassiveTransformer, FiberParser,
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
      type=am.AutoExprContextType(am.PotentialExprType(am.IntType(mode='positive_or_null')))
    )
  }

  def __init__(self, fiber: FiberParser):
    self._fiber = fiber

  def prepare(self, data: Attributes, /, envs):
    if (attr := data.get('repeat')):
      symbol = self._fiber.allocate_eval_symbol()

      env = EvalEnv({
        'index': EvalEnvValue(
          description="The current iteration index.",
          ExprEvalType=am.KnownDeferredExprEval(name='index', phase=1)
        )
      }, name="Repeat", symbol=symbol)

      return am.LanguageServiceAnalysis(), PassiveTransformerPreparationResult((attr, symbol), envs=[env])
    else:
      return am.LanguageServiceAnalysis(), None

  def adopt(self, data: tuple[Evaluable[LocatedValue[int | Literal['forever']]], EvalSymbol], /, adoption_stack, trace):
    attr, symbol = data
    analysis, count = attr.evaluate_provisional(EvalContext(adoption_stack))

    if isinstance(count, EllipsisType):
      return analysis, Ellipsis

    return analysis, TransformerAdoptionResult((count, symbol))

  def execute(self, data: tuple[Evaluable[LocatedValue[int | Literal['forever']]], EvalSymbol], /, block):
    count, symbol = data
    return am.BaseAnalysis(), Block(block, count, symbol)

class Parser(BaseParser):
  namespace = namespace

  def __init__(self, fiber):
    super().__init__(fiber)
    self.transformers = [Transformer(fiber)]


@dataclass
class Block(BaseBlock):
  block: BaseBlock
  count: Evaluable[LocatedValue[int | Literal['forever']]]
  symbol: EvalSymbol

  def __get_node_children__(self):
    return [self.block]

  def __get_node_name__(self):
    return ["Repeat"]

  def duration(self):
    match self.count:
      case EvaluableConstantValue(LocatedValue('forever')):
        return am.DurationTerm.forever()
      case EvaluableConstantValue(LocatedValue(int() as count)):
        return self.block.duration() * count
      case _:
        return am.DurationTerm.unknown()

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
      "duration": self.duration().export()
    }

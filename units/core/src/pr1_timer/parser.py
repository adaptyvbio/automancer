from dataclasses import dataclass
from types import EllipsisType
from typing import Literal, TypedDict, cast

from pint import Quantity
from pr1.fiber.eval import EvalContext
from pr1.fiber.expr import Evaluable
from pr1.fiber.langservice import (Analysis, Attribute, EnumType,
                                   PotentialExprType, QuantityType, UnionType)
from pr1.fiber.parser import (BaseLeadTransformer, BaseParser,
                              LeadTransformerPreparationResult)
from pr1.fiber.process import BaseProcessData, ProcessBlock
from pr1.reader import LocatedString, LocatedValue

from . import namespace


@dataclass
class ProcessData(BaseProcessData):
  duration: Evaluable[LocatedValue[Quantity | Literal['forever']]]

  def export(self):
    return {
      "duration": self.duration.export()
    }

  def import_point(self, data, /):
    from .process import ProcessPoint
    return ProcessPoint(progress=data["progress"])

class Attributes(TypedDict):
  wait: Evaluable[LocatedValue[Quantity | Literal['forever']]]


class Transformer(BaseLeadTransformer):
  priority = 100
  attributes = {
    'wait': Attribute(
      description="Waits for a fixed delay.",
      type=PotentialExprType(UnionType(
        EnumType('forever'),
        QuantityType('second')
      ))
    )
  }

  def prepare(self, data: Attributes, /, adoption_envs, runtime_envs):
    if (attr := data.get('wait')):
      return Analysis(), [LeadTransformerPreparationResult(attr, origin_area=cast(LocatedString, next(iter(data.keys()))).area)]
    else:
      return Analysis(), list()

  def adopt(self, data: Evaluable[LocatedValue[Quantity | Literal['forever']]], /, adoption_stack, trace):
    from .process import Process

    analysis, duration = data.eval(EvalContext(adoption_stack), final=False)

    if isinstance(duration, EllipsisType):
      return analysis, Ellipsis

    return analysis, ProcessBlock(
      ProcessData(duration),
      Process
    )


class Parser(BaseParser):
  namespace = namespace
  transformers = [Transformer()]

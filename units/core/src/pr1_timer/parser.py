from dataclasses import dataclass
from types import EllipsisType
from typing import Literal, TypedDict

from pint import Quantity
from pr1.fiber.eval import EvalContext
from pr1.fiber.expr import Evaluable
from pr1.fiber.langservice import (Analysis, Attribute, EnumType,
                                   PotentialExprType, QuantityType, UnionType)
from pr1.fiber.parser import (BaseLeadTransformer, BaseParser,
                              LeadTransformerPreparationResult)
from pr1.fiber.segment import SegmentBlock, SegmentProcessData
from pr1.reader import LocatedValue
from pr1.util.misc import Exportable

from . import namespace


@dataclass
class TimerProcessData(Exportable):
  duration: Evaluable[LocatedValue[Quantity | Literal['forever']]]

  def export(self):
    return { "duration": self.duration.export() }

class Attributes(TypedDict):
  wait: Evaluable[LocatedValue[Quantity | Literal['forever']]]

# class Attributes(TypedDict, total=False):
#   wait: Evaluable[LocatedValue[Quantity | Literal['forever']]]

# class Parser(BaseParser):
#   namespace = namespace

#   segment_attributes = {
#     'wait': lang.Attribute(
#       description="Waits for a fixed delay.",
#       type=lang.PotentialExprType(lang.UnionType(
#         lang.EnumType('forever'),
#         lang.QuantityType('second')
#       ))
#     )
#   }

  # def prepare(self, attrs: Attributes, /):
  #   if (attr := attrs.get('wait')):
  #     return lang.Analysis(), [
  #       StateApplierTransform(settle=True, stable=False),
  #       SegmentTransform(self.namespace, TimerProcessData(attr))
  #     ]
  #   else:
  #     return lang.Analysis(), Transforms()



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

  def prepare(self, attrs: Attributes, /, adoption_envs, runtime_envs):
    if (attr := attrs.get('wait')):
      return Analysis(), [LeadTransformerPreparationResult(attr)]
    else:
      return Analysis(), list()

  def adopt(self, data: Evaluable[LocatedValue[Quantity | Literal['forever']]], /, adoption_stack):
    analysis, duration = data.eval(EvalContext(adoption_stack), final=False)

    if isinstance(duration, EllipsisType):
      return analysis, Ellipsis

    return analysis, SegmentBlock(
      SegmentProcessData(TimerProcessData(duration), namespace=namespace)
    )

  # def finish(self, data: TimerProcessData, /):
  #   return SegmentBlock(
  #     SegmentProcessData(data, namespace=namespace)
  #   )


class Parser(BaseParser):
  namespace = namespace
  transformers = [Transformer()]

# @dataclass
# class TimerTransform(ProcessTransform):
#   duration: Evaluable[LocatedValue[Quantity | Literal['forever']]]

#   def adopt_process(self, adoption_envs, runtime_envs, adoption_stack):
#     analysis, duration = self.duration.eval(EvalContext(adoption_stack), final=False)

#     if isinstance(duration, EllipsisType):
#       return analysis, Ellipsis

#     return namespace, TimerProcessData(duration)


# class Parser(BaseSimplifiedProcessParser):
#   namespace = namespace
#   priority = 100

#   segment_attributes = {
#     'wait': lang.Attribute(
#       description="Waits for a fixed delay.",
#       type=lang.PotentialExprType(lang.UnionType(
#         lang.EnumType('forever'),
#         lang.QuantityType('second')
#       ))
#     )
#   }

#   def parse(self, attrs: Attributes, /):
#     return namespace, TimerProcessData(attrs['wait'])

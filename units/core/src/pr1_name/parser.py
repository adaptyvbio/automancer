from types import EllipsisType
from typing import Optional, Self, TypedDict

from pr1.fiber.eval import EvalContext
from pr1.fiber.expr import Evaluable
from pr1.fiber.langservice import (Analysis, Attribute, PotentialExprType,
                                   StrType)
from pr1.fiber.parser import BaseParser, BlockUnitData, BlockUnitState, Transforms
from pr1.reader import LocatedString
from pr1_state.parser import StatePublisherTransform

from . import namespace


class Attributes(TypedDict, total=False):
  name: Evaluable[LocatedString]

class Parser(BaseParser):
  namespace = namespace
  segment_attributes = {
    'name': Attribute(
      description="Sets the block's name.",
      type=PotentialExprType(StrType(), static=True)
    )
  }

  def prepare(self, attrs: Attributes):
    if (attr := attrs.get('name')):
      return Analysis(), [StatePublisherTransform(NameState("hello"))]

    #   analysis, result = attr.eval(EvalContext(adoption_stack), final=True)
    #   return analysis, BlockUnitData(NameState(result.value if not isinstance(result, EllipsisType) else None))
    else:
      return Analysis(), Transforms()


class NameState(BlockUnitState):
  def __init__(self, value: Optional[str], /):
    self.value = value

  def __or__(self, other: Self):
    return NameState(self.value or other.value)

  def export(self):
    return {
      "value": self.value
    }

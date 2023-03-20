from types import EllipsisType
from typing import Optional, Self, TypedDict

from pr1.fiber.eval import EvalContext
from pr1.fiber.expr import Evaluable
from pr1.fiber.langservice import (Analysis, Attribute, PotentialExprType,
                                   StrType)
from pr1.fiber.parser import BaseParser, BlockUnitData, BlockUnitState
from pr1.reader import LocatedString

from . import namespace


class Attributes(TypedDict, total=False):
  name: Evaluable[LocatedString]

class NameParser(BaseParser):
  namespace = namespace
  segment_attributes = {
    'name': Attribute(
      description="Sets the block's name.",
      type=PotentialExprType(StrType(), static=True)
    )
  }

  def parse_block(self, attrs: Attributes, /, adoption_stack, trace):
    if (attr := attrs.get('name')):
      analysis, result = attr.eval(EvalContext(adoption_stack), final=True)
      return analysis, BlockUnitData(state=NameState(result.value if not isinstance(result, EllipsisType) else None))
    else:
      return Analysis(), BlockUnitData(state=NameState(None))


class NameState(BlockUnitState):
  def __init__(self, value: Optional[str], /):
    self.value = value

  def __or__(self, other: Self):
    return NameState(self.value or other.value)

  def export(self):
    return {
      "value": self.value
    }

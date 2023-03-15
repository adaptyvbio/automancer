from dataclasses import dataclass
from types import EllipsisType
from typing import Any, NotRequired, TypedDict

from pr1.fiber import langservice as lang
from pr1.fiber.eval import EvalContext
from pr1.fiber.expr import Evaluable, PythonExprObject
from pr1.fiber.parser import BaseParser, BlockUnitData, BlockUnitPreparationData, BlockUnitState
from pr1.reader import LocatedList, LocatedString

from . import namespace


class Attributes(TypedDict, total=False):
  expect: Evaluable[LocatedList]

class StateDataEntry(TypedDict):
  condition: PythonExprObject
  message: NotRequired[Evaluable[LocatedString]]

@dataclass
class StateData(BlockUnitState):
  entries: list[StateDataEntry]

  def export(self):
    return {
      "entries": [{
        "condition": entry['condition'].export()
      } for entry in self.entries]
    }


class Parser(BaseParser):
  namespace = namespace
  segment_attributes = {
    'expect': lang.Attribute(
      lang.EvaluableContainerType(
        lang.ListType(
          lang.SimpleDictType({
            'condition': lang.Attribute(
              lang.PotentialExprType(lang.BoolType(), dynamic=True, literal=False),
              required=True
            ),
            'effect': lang.PotentialExprType(lang.EnumType('error', 'warning')),
            'message': lang.PotentialExprType(lang.StrType())
          })
        ),
        depth=1
      )
    )
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def prepare_block(self, attrs, /, adoption_envs, runtime_envs):
    return lang.Analysis(), BlockUnitPreparationData(attrs)

  def parse_block(self, attrs: Attributes, /, adoption_stack, trace):
    if (attr := attrs.get('expect')):
      analysis, result = attr.eval(EvalContext(adoption_stack), final=True)

      if isinstance(result, EllipsisType):
        return analysis, Ellipsis

      return analysis, BlockUnitData(state=StateData(result))

    return lang.Analysis(), BlockUnitData()

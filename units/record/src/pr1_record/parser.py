from dataclasses import dataclass
from types import EllipsisType
from typing import Literal, TypedDict

from pr1.fiber import langservice as lang
from pr1.fiber.expr import Evaluable
from pr1.fiber.parser import BaseParser, BlockUnitData, BlockUnitState
from pr1.reader import LocatedValue

from . import namespace


OutputFormat = Literal['csv', 'npy', 'npz', 'xlsx']

class StateData(TypedDict):
  fields: list
  format: LocatedValue[OutputFormat]
  output: LocatedValue[lang.FileRef]

class Parser(BaseParser):
  namespace = namespace
  segment_attributes = {
    'record': lang.Attribute(
      lang.EvaluableContainerType(
        lang.SimpleDictType({
          'fields': lang.Attribute(
            lang.ListType(lang.SimpleDictType({
              'dtype': lang.PotentialExprType(lang.DataTypeType()),
              'name': lang.PotentialExprType(lang.StrType()),
              'value': lang.Attribute(lang.PotentialExprType(lang.StrType()), required=True)
            })),
            required=True
          ),
          'format': lang.Attribute(
            lang.PotentialExprType(lang.EnumType('csv', 'npy', 'npz', 'xlsx'))
          ),
          'output': lang.Attribute(
            lang.DeferredAnalysisType(lang.PotentialExprType(lang.FileRefType(text=False)), depth=1),
            required=True
          )
        }),
        depth=2
      )
    )
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def parse_block(self, attrs, /, adoption_stack, trace):
    if (attr := attrs.get('record')):
      analysis, result = attr.evaluate(adoption_stack)

      if isinstance(result, EllipsisType):
        return analysis, Ellipsis

      return analysis, BlockUnitData(state=RecordState(result))

    return lang.Analysis(), BlockUnitData()


@dataclass
class RecordState(BlockUnitState):
  data: Evaluable[LocatedValue[StateData]]

  def export(self):
    return {}

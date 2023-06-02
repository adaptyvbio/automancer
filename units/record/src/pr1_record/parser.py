from dataclasses import dataclass
from types import EllipsisType
from typing import Any, Literal, Optional, Protocol

import numpy as np

import pr1 as am
from pr1.fiber.expr import Evaluable
from pr1.fiber.parser import BaseBlock, BaseParser, BasePassiveTransformer, BlockUnitData

from . import namespace


OutputFormat = Literal['csv', 'npy', 'npz', 'xlsx']

class Field(Protocol):
  dtype: np.dtype
  name: Optional[str]
  value: str

class ProgramData(Protocol):
  field: list[Field]
  format: Optional[OutputFormat]
  output: am.DataRef


class Transformer(BasePassiveTransformer):
  def __init__(self):
    super().__init__({
      'record': am.Attribute(
        am.AutoExprContextType(
        am.RecordType({
          'fields': am.Attribute(
            am.ListType(am.RecordType({
              'dtype': am.Attribute(
                am.DataTypeType(),
                default=None,
                description="The field's type.",
                documentation=["Defaults to automatic detection."],
              ),
              'name': am.Attribute(
                am.StrType(),
                default=None,
                description="The field's name."
              ),
              'value': am.Attribute(
                am.StrType(),
                description="The field's value."
              )
            }))
          ),
          'format': am.Attribute(
            am.EnumType(*OutputFormat.__args__), # type: ignore
            default=None,
            description="The output format. One of `csv`, `json`, `npy`, `npz` or `xlsx`.",
            documentation=["Defaults to automatic detection based on the file extension, if any."]
          ),
          'output': am.Attribute(
            am.WritableDataRefType(),
            description="The output object."
          )
        })),
        description="Record values to a compact file format"
      )
    }, priority=600)

  def execute(self, data, /, block):
    return am.LanguageServiceAnalysis(), Block(block, data['record'])


@dataclass
class Block(BaseBlock):
  child_block: BaseBlock
  data: Evaluable

  def __get_node_children__(self):
    return [self.child_block]

  def __get_node_name__(self):
    return ["Repeat"]

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
      "child": self.child_block.export()
    }

class Parser(BaseParser):
  def __init__(self, fiber):
    super().__init__(fiber)

    self._fiber = fiber
    self.transformers = [Transformer()]

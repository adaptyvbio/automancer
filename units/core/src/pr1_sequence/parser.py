from dataclasses import dataclass
from types import EllipsisType
from typing import Any, TypedDict, cast

from pr1.fiber.langservice import Analysis, AnyType, Attribute, ListType
from pr1.fiber.parser import (BaseBlock, BaseLeadTransformer, BaseParser,
                              FiberParser, Layer,
                              LeadTransformerPreparationResult)
from pr1.reader import LocatedString

from . import namespace


class Attributes(TypedDict, total=False):
  actions: list[Any]

class Transformer(BaseLeadTransformer):
  priority = 200
  attributes = {
    'actions': Attribute(
      description="Describes a nested list of steps.",
      documentation=["Actions can be specified as a standard list:\n```prl\nactions:\n```\nThe output structure will appear as flattened."],
      kind='class',
      signature="actions:\n  - <action 1>\n  - <action 2>",
      type=ListType(AnyType())
    )
  }

  def __init__(self, fiber: FiberParser):
    self._fiber = fiber

  def prepare(self, data: Attributes, /, adoption_envs, runtime_envs):
    analysis = Analysis()

    if (attr := data.get('actions')):
      action_layers = list[Layer]()

      for action_source in attr:
        layer = analysis.add(self._fiber.parse_layer(action_source, adoption_envs, runtime_envs))

        if not isinstance(layer, EllipsisType):
          action_layers.append(layer)

      return analysis, [LeadTransformerPreparationResult(action_layers, origin_area=cast(LocatedString, next(iter(data.keys()))).area)]

    return analysis, list()

  def adopt(self, data: list[Layer], /, adoption_stack, trace):
    analysis = Analysis()
    children = list[BaseBlock]()

    for action_layer in data:
      action_block = analysis.add(action_layer.adopt_lead(adoption_stack, trace))

      if not isinstance(action_block, EllipsisType):
        children.append(action_block)

    return analysis, Block(children) if children else Ellipsis


class Parser(BaseParser):
  namespace = namespace

  def __init__(self, fiber: FiberParser):
    self.transformers = [Transformer(fiber)]

@dataclass
class Block(BaseBlock):
  children: list[BaseBlock]

  def __get_node_children__(self):
    return self.children

  def __get_node_name__(self):
    return "Sequence"

  def create_program(self, handle):
    from .program import Program
    return Program(self, handle)

  def import_point(self, data, /):
    from .program import ProgramPoint

    index = data["index"]

    return ProgramPoint(
      child=(self.children[index].import_point(data["child"]) if data["child"] is not None else None),
      index=index
    )

  def export(self):
    return {
      "name": "_",
      "namespace": namespace,
      "children": [child.export() for child in self.children]
    }

from dataclasses import KW_ONLY, dataclass
from enum import IntEnum
from types import EllipsisType
from typing import Any, Optional, TypedDict, cast

from pr1.fiber.eval import EvalStack
from pr1.fiber.langservice import Analysis, AnyType, Attribute, ListType
from pr1.fiber.master2 import ProgramOwner
from pr1.fiber.parser import (BaseBlock, BaseLeadTransformer, BaseParser,
                              BlockData, BlockProgram, FiberParser, Layer,
                              TransformerPreparationResult)
from pr1.fiber.process import ProgramExecEvent
from pr1.reader import LocationArea
from pr1.util.decorators import debug
from pr1.util.misc import Exportable

from . import namespace

SequenceActionInfo = tuple[BlockData, LocationArea]

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

  def prepare(self, attrs: Attributes, /, adoption_envs, adoption_stack):
    analysis = Analysis()

    if (attr := attrs.get('actions')):
      action_layers = list[Layer]()

      for action_source in attr:
        layer = analysis.add(self._fiber.parse_layer(action_source, adoption_envs, adoption_stack))

        if not isinstance(layer, EllipsisType):
          action_layers.append(layer)

      return analysis, TransformerPreparationResult(action_layers)

    return analysis, None

  def adopt(self, data: list[Layer], /, adoption_stack):
    analysis = Analysis()
    children = list[BaseBlock]()

    for action_layer in data:
      action_block = analysis.add(action_layer.adopt_lead(adoption_stack))

      if not isinstance(action_block, EllipsisType):
        children.append(action_block)

    return analysis, SequenceBlock(children) if children else Ellipsis


class Parser(BaseParser):
  namespace = namespace

  def __init__(self, fiber: FiberParser):
    self.transformers = [Transformer(fiber)]


class SequenceProgramMode(IntEnum):
  Halted = 0
  Halting = 1
  Normal = 2

@dataclass(kw_only=True)
class SequenceProgramLocation(Exportable):
  index: int

  def export(self):
    return {
      "index": self.index
    }

@dataclass(kw_only=True)
class SequenceProgramPoint:
  child: Optional[Any]
  index: int

  @classmethod
  def import_value(cls, data: Any, /, block: 'SequenceBlock', *, master):
    index = data["index"]
    child_block = block._children[index]

    return cls(
      child=(child_block.Point.import_value(data["child"], child_block, master=master) if data["child"] is not None else None),
      index=index
    )

@debug
class SequenceProgram(BlockProgram):
  def __init__(self, block: 'SequenceBlock', handle):
    self._block = block
    # self._block._children = [x.child for x in block._children]
    self._handle = handle

    self._child_index: int
    self._child_program: ProgramOwner
    self._halting = False
    self._point: Optional[SequenceProgramPoint]

  def halt(self):
    assert not self._halting

    self._halting = True
    self._child_program.halt()

  # def jump(self, point: SequenceProgramPoint):
  #   if point.index != self._child_index:
  #     self._point = point
  #     self.halt()
  #   elif point.child:
  #     self._child_program.jump(point.child)


  # def set_interrupt(self, value: bool, /):
  #   self._interrupting = value
  #   self._iterator.trigger()


  async def run(self, stack: EvalStack):
    initial_point = None
    self._point = initial_point or SequenceProgramPoint(child=None, index=0)

    while True:
      assert self._point
      self._child_index = self._point.index

      if self._child_index >= len(self._block._children):
        break

      child_block = self._block._children[self._child_index]

      self._child_program = self._handle.create_child(child_block)
      self._handle.send(ProgramExecEvent(location=SequenceProgramLocation(index=self._child_index)))

      point = self._point
      self._point = None

      await self._child_program.run(stack)
      next_index = self._point.index if self._point else (self._child_index + 1)

      if self._halting or (next_index >= len(self._block._children)):
        return

      self._handle.collect_children()
      self._point = SequenceProgramPoint(child=None, index=(self._child_index + 1))

      await self._handle.resume_parent()


@debug
class SequenceBlock(BaseBlock):
  Point: type[SequenceProgramPoint] = SequenceProgramPoint
  Program = SequenceProgram

  def __init__(self, children: list[BaseBlock]):
    self._children = children

  def __getitem__(self, key):
    return self._children[key]

  def __get_node_children__(self):
    return self._children

  def __get_node_name__(self):
    return "Sequence"

  def export(self):
    return {
      "namespace": "sequence",
      "children": [child.export() for child in self._children]
    }

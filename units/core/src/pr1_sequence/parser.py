from dataclasses import dataclass
from enum import IntEnum
import functools
from types import EllipsisType
from typing import Any, Optional, TypedDict, cast

from pr1.fiber import langservice as lang
from pr1.fiber.eval import EvalStack
from pr1.fiber.master2 import ProgramOwner
from pr1.fiber.parser import Attrs, BaseBlock, BaseParser, BaseTransform, BlockData, BlockProgram, BlockState, BlockUnitData, BlockUnitPreparationData, FiberParser, Transforms
from pr1.fiber.process import ProgramExecEvent
from pr1.devices.claim import ClaimSymbol
from pr1.reader import LocationArea
from pr1.util.decorators import debug
from pr1.util.iterators import TriggerableIterator
from pr1.util.misc import Exportable


SequenceActionInfo = tuple[BlockData, LocationArea]

class SequenceAttrs(TypedDict, total=False):
  actions: list[Any]

SequencePrep = list[tuple[Attrs, LocationArea]]

class SequenceParser(BaseParser):
  namespace = "sequence"
  priority = 700

  root_attributes = dict()

  @functools.cached_property
  def segment_attributes(self):
    return {
      'actions': lang.Attribute(
        description="Describes a nested list of steps.",
        documentation=["Actions can be specified as a standard list:\n```prl\nactions:\n```\nThe output structure will appear as flattened."],
        kind='class',
        signature="actions:\n  - <action 1>\n  - <action 2>",
        type=lang.ListType(lang.AnyType())
      )
    }

  def __init__(self, fiber: FiberParser):
    self._fiber = fiber

  def prepare_block(self, attrs: SequenceAttrs, /, adoption_envs, runtime_envs):
    if (attr := attrs.get('actions')):
      actions_prep = SequencePrep()
      analysis = lang.Analysis()
      analysis += cast(lang.ListType, self.segment_attributes['actions'].type).create_completion(attr, self._fiber.block_type)

      for action_source in attr:
        action_prep = analysis.add(self._fiber.prepare_block(action_source, adoption_envs=adoption_envs, runtime_envs=runtime_envs))

        if isinstance(action_prep, EllipsisType):
          continue

        actions_prep.append((action_prep, action_source.area))

      return analysis, BlockUnitPreparationData(actions_prep)

    else:
      return lang.Analysis(), BlockUnitPreparationData()

  def parse_block(self, attrs: SequencePrep, /, adoption_stack, trace):
    analysis = lang.Analysis()
    actions_info = list[SequenceActionInfo]()

    for action_prep, action_area in attrs:
      action_data = analysis.add(self._fiber.parse_block(action_prep, adoption_stack))

      if not isinstance(action_data, EllipsisType):
        actions_info.append((action_data, action_area))

    return analysis, BlockUnitData(transforms=[
      SequenceTransform(actions_info, parser=self)
    ])


@debug
class SequenceTransform(BaseTransform):
  def __init__(self, actions_info: list[SequenceActionInfo], /, parser: SequenceParser):
    self._actions_info = actions_info
    self._parser = parser

  def execute(self, state: BlockState, transforms: Transforms, *, origin_area: LocationArea):
    analysis = lang.Analysis()
    children = list[BaseBlock]()

    for action_data, action_area in self._actions_info:
      action_block = analysis.add(self._parser._fiber.execute(action_data.state, transforms + action_data.transforms, origin_area=action_area))

      if not isinstance(action_block, EllipsisType):
        children.append(action_block)

    return analysis, SequenceBlock(children) if children else Ellipsis


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

  # @property
  # def busy(self):
  #   return (self._mode == SequenceProgramMode.Halting) or self._child_program.busy

  # def get_child(self, block_key: int, exec_key: None):
  #   assert block_key == self._child_index
  #   return self._child_program

  # def import_message(self, message: Any):
  #   match message["type"]:
  #     case "halt":
  #       self.halt()
  #     case "jump":
  #       self.jump(self._block.Point.import_value(message["point"], block=self._block, master=self._master))
  #     case "setInterrupt":
  #       self.set_interrupt(message["value"])

  # def halt(self):
  #   assert self._mode == SequenceProgramMode.Normal

  #   self._mode = SequenceProgramMode.Halting
  #   self._child_program.halt()

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

      # last_event = await self._child_program.run(stack)
      await self._child_program.run(stack)
      next_index = self._point.index if self._point else (self._child_index + 1)

      if self._halting or (next_index >= len(self._block._children)):
        return

      self._handle.collect()

      # self._handle.send(last_event)
      self._point = SequenceProgramPoint(child=None, index=(self._child_index + 1))


@debug
class SequenceBlock(BaseBlock):
  Point: type[SequenceProgramPoint] = SequenceProgramPoint
  Program = SequenceProgram

  def __init__(self, children: list[BaseBlock]):
    self._children = children

  def __getitem__(self, key):
    return self._children[key]

  def export(self):
    return {
      "namespace": "sequence",
      "children": [child.export() for child in self._children]
    }

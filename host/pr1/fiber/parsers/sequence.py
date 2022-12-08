import asyncio
from dataclasses import dataclass
from enum import IntEnum
from types import EllipsisType
from typing import Any, Optional

from .. import langservice as lang
from ..eval import EvalEnvs, EvalStack
from ..parser import BaseBlock, BaseParser, BaseTransform, BlockAttrs, BlockData, BlockProgram, BlockState, BlockUnitData, BlockUnitState, FiberParser, Transforms
from ..process import ProgramExecEvent
from ...devices.claim import ClaimSymbol
from ...reader import LocationArea
from ...util import schema as sc
from ...util.decorators import debug
from ...util.iterators import CoupledStateIterator2


ActionInfo = tuple[BlockData, LocationArea]

class SequenceParser(BaseParser):
  namespace = "sequence"
  root_attributes = dict()
  segment_attributes = {
    'actions': lang.Attribute(
      description="Describes a nested list of steps.",
      documentation=["Actions can be specified as a standard list:\n```prl\nactions:\n```\nThe output structure will appear as flattened."],
      kind='class',
      optional=True,
      signature="actions:\n  - <action 1>\n  - <action 2>",
      type=lang.PrimitiveType(list)
    )
  }

  def __init__(self, fiber: FiberParser):
    self._fiber = fiber

  def parse_block(self, block_attrs: BlockAttrs, /, adoption_envs: EvalEnvs, adoption_stack: EvalStack, runtime_envs: EvalEnvs) -> tuple[lang.Analysis, BlockUnitData | EllipsisType]:
  # def parse_block(self, block_attrs: Any, /, adoption_envs, adoption_stack, runtime_envs):
    attrs = block_attrs[self.namespace]

    if 'actions' in attrs:
      if isinstance(attrs['actions'], EllipsisType):
        return lang.Analysis(), Ellipsis

      actions_info: list[ActionInfo] = list()

      for action_attrs in attrs['actions']:
        action_data = self._fiber.parse_block(action_attrs, adoption_envs=adoption_envs, adoption_stack=adoption_stack, runtime_envs=runtime_envs, allow_expr=True)

        if not isinstance(action_data, EllipsisType):
          actions_info.append((action_data, action_attrs.area))

      return lang.Analysis(), BlockUnitData(transforms=[
        SequenceTransform(actions_info, parser=self)
      ])
    else:
      return lang.Analysis(), BlockUnitData()


@debug
class SequenceTransform(BaseTransform):
  def __init__(self, actions_info: list[ActionInfo], /, parser: SequenceParser):
    self._actions_info = actions_info
    self._parser = parser

  def execute(self, state: BlockState, transforms: Transforms, *, origin_area: LocationArea):
    analysis = lang.Analysis()
    children: list[BaseBlock] = list()

    for action_data, action_area in self._actions_info:
      action_block = self._parser._fiber.execute(action_data.state, transforms + action_data.transforms, origin_area=action_area)

      if not isinstance(action_block, EllipsisType):
        children.append(action_block)

    return analysis, SequenceBlock(children, state=state) if children else Ellipsis


class SequenceProgramMode(IntEnum):
  Halted = 5
  Halting = 4
  Normal = 0
  PausingChild = 1
  PausingState = 2
  Paused = 3

@dataclass(kw_only=True)
class SequenceProgramLocation:
  child: Optional[Any] = None
  index: int = 0
  interrupting: bool = False
  mode: SequenceProgramMode
  state: Optional[Any]

  def export(self):
    return {
      "child": self.child and self.child.export(),
      "index": self.index,
      "interrupting": self.interrupting,
      "mode": self.mode,
      "state": self.state and self.state.export()
    }

@dataclass(kw_only=True)
class SequenceProgramPoint:
  child: Optional[Any]
  index: int

@debug
class SequenceProgram(BlockProgram):
  def __init__(self, block: 'SequenceBlock', master, parent):
    self._block = block
    self._master = master
    self._parent = parent

    self._child_index: int
    self._child_program: BlockProgram
    self._interrupting = False
    self._mode: SequenceProgramMode
    self._point: Optional[SequenceProgramPoint]

  def get_child(self, key: int):
    return self._child_program

  def import_message(self, message: Any):
    match message["type"]:
      case "halt":
        self.halt()
        # self.jump(SequenceProgramPoint(child=None, index=2))
      case "pause":
        self.pause()
      case "resume":
        self.resume()
      case "setInterrupt":
        self.set_interrupt(message["value"])

  def halt(self):
    assert self._mode in (SequenceProgramMode.Normal, SequenceProgramMode.Paused)

    self._mode = SequenceProgramMode.Halting
    self._child_program.halt()

  def jump(self, point: SequenceProgramPoint):
    if point.index != self._child_index:
      self._point = point
      self.halt()
    elif point.child:
      self._child_program.jump(point.child)


  def pause(self):
    assert self._mode == SequenceProgramMode.Normal

    self._mode = SequenceProgramMode.PausingChild
    self._child_program.pause()

  def resume(self):
    assert self._mode == SequenceProgramMode.Paused
    self._child_program.resume()

  def set_interrupt(self, value: bool, /):
    self._interrupting = value
    self._iterator.trigger()

  async def run(self, initial_point: Optional[SequenceProgramPoint], symbol: ClaimSymbol):
    self._point = initial_point or SequenceProgramPoint(child=None, index=0)

    async def run():
      while True:
        assert self._point
        self._child_index = self._point.index

        if self._child_index >= len(self._block._children):
          break

        child_block = self._block._children[self._child_index]
        self._child_program = child_block.Program(child_block, self._master, self)
        self._mode = SequenceProgramMode.Normal

        point = self._point
        self._point = None

        async for event in self._child_program.run(point.child, ClaimSymbol(symbol)):
          yield event

        if self._point:
          pass
        elif self._mode == SequenceProgramMode.Halted:
          break
        else:
          self._point = SequenceProgramPoint(child=None, index=(self._child_index + 1))

    self._iterator = CoupledStateIterator2[ProgramExecEvent, Any](run())

    state_instance = self._master.create_instance(self._block.state, notify=self._iterator.notify, symbol=symbol)
    state_location = state_instance.apply(self._block.state, resume=False)
    self._iterator.notify(state_location)

    async for event, state_location in self._iterator:
      if (self._mode == SequenceProgramMode.PausingChild) and event.stopped:
        self._mode = SequenceProgramMode.PausingState
        await state_instance.suspend()

      if (self._mode == SequenceProgramMode.Halting) and event.stopped:
        self._mode = SequenceProgramMode.Halted

      if self._mode == SequenceProgramMode.PausingState:
        self._mode = SequenceProgramMode.Paused

      if (self._mode == SequenceProgramMode.Paused) and (not event.stopped):
        self._mode = SequenceProgramMode.Normal
        state_location = state_instance.apply(self._block.state, resume=False)

      yield ProgramExecEvent(
        state=SequenceProgramLocation(
          child=event.state,
          index=self._child_index,
          interrupting=self._interrupting,
          mode=self._mode,
          state=state_location
        ),
        stopped=(self._mode in (SequenceProgramMode.Paused, SequenceProgramMode.Halted))
      )

    await state_instance.suspend()


@debug
class SequenceBlock(BaseBlock):
  Program = SequenceProgram

  def __init__(self, children: list[BaseBlock], state: BlockState):
    self._children = children
    self.state: BlockState = state

  def __getitem__(self, key):
    return self._children[key]

  def linearize(self, context, parent_state):
    analysis = lang.Analysis()
    output = list()

    for block in self._children:
      item_analysis, item = block.linearize(context, parent_state | self.state)
      analysis += item_analysis

      if item is Ellipsis:
        continue

      output += item

    return analysis, output

  def export(self):
    return {
      "namespace": "sequence",
      "state": self.state.export(),

      "children": [child.export() for child in self._children]
    }

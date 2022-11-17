from dataclasses import dataclass
from enum import IntEnum
from types import EllipsisType
from typing import Any, Optional

from ..eval import EvalEnvs, EvalStack
from .. import langservice as lang
from ..parser import BaseBlock, BaseParser, BaseTransform, BlockAttrs, BlockData, BlockProgram, BlockState, BlockUnitData, BlockUnitState, FiberParser, Transforms
from ..process import ProgramExecEvent
from ...reader import LocationArea
from ...util import schema as sc
from ...util.decorators import debug


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
  Normal = 0
  Pausing = 1
  Interrupting = 2
  Stopped = 3

@dataclass(kw_only=True)
class SequenceProgramState:
  child: Optional[Any] = None
  index: int = 0
  mode: SequenceProgramMode

  def export(self):
    return {
      "child": self.child and self.child.export(),
      "index": self.index,
      "node": self.mode
    }

@debug
class SequenceProgram(BlockProgram):
  def __init__(self, block: 'SequenceBlock', master, parent):
    self._block = block
    self._master = master
    self._parent = parent

    self._child_program: BlockProgram
    self._child_index = 0

    self._interrupting = False

  def import_message(self, message: Any):
    match message["type"]:
      case "setInterrupt":
        self.set_interrupt(message["value"])

  def pause(self):
    self._interrupting = False
    self._child_program.pause()

  def set_interrupt(self, value: bool, /):
    self._interrupting = value

  async def run(self, initial_state: Optional[SequenceProgramState]):
    start_state = initial_state or SequenceProgramState(mode=SequenceProgramMode.Normal)

    for child_index, child_block in enumerate(self._block._children):
      if child_index < start_state.index:
        continue

      if self._interrupting:
        self._interrupting = False

        yield ProgramExecEvent(
          state=SequenceProgramState(
            index=child_index,
            mode=SequenceProgramMode.Stopped
          ),
          stopped=True
        )

      self._child_program = child_block.Program(child_block, self._master, self)

      async for info in self._child_program.run(start_state.child if child_index == start_state.index else None):
        yield ProgramExecEvent(
          state=SequenceProgramState(
            child=info.state,
            index=child_index,
            mode=SequenceProgramMode.Stopped
          ),
          stopped=info.stopped,
          time=info.time
        )


@debug
class SequenceBlock(BaseBlock):
  Program = SequenceProgram

  def __init__(self, children: list[BaseBlock], state: BlockState):
    self._children = children
    self.state = state

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

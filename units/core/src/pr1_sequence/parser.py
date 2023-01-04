import asyncio
from dataclasses import dataclass
from enum import IntEnum
from types import EllipsisType
from typing import Any, Optional

from pr1.fiber import langservice as lang
from pr1.fiber.eval import EvalEnvs, EvalStack
from pr1.fiber.parser import BaseBlock, BaseParser, BaseTransform, BlockAttrs, BlockData, BlockProgram, BlockState, BlockUnitData, BlockUnitState, FiberParser, Transforms
from pr1.fiber.process import ProgramExecEvent
from pr1.devices.claim import ClaimSymbol
from pr1.reader import LocationArea
from pr1.util import schema as sc
from pr1.util.decorators import debug
from pr1.util.iterators import CoupledStateIterator2, TriggerableIterator


ActionInfo = tuple[BlockData, LocationArea]

class SequenceParser(BaseParser):
  namespace = "sequence"
  priority = 700

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

    return analysis, SequenceBlock(children) if children else Ellipsis


class SequenceProgramMode(IntEnum):
  Halted = -1
  Resuming = -2

  Halting = 0
  Normal = 1
  Pausing = 2
  Paused = 3

@dataclass(kw_only=True)
class SequenceProgramLocation:
  child: Optional[Any] = None
  index: int = 0
  interrupting: bool = False
  mode: SequenceProgramMode

  def export(self):
    return {
      "child": self.child and self.child.export(),
      "index": self.index,
      "interrupting": self.interrupting,
      "mode": self.mode
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
  def __init__(self, block: 'SequenceBlock', master, parent):
    self._block = block
    self._master = master
    self._parent = parent

    self._child_index: int
    self._child_program: BlockProgram
    self._child_stopped: bool
    self._interrupting = False
    self._iterator: TriggerableIterator[ProgramExecEvent[SequenceProgramLocation]]
    self._mode: SequenceProgramMode
    self._point: Optional[SequenceProgramPoint]

  @property
  def busy(self):
    return self._mode in (
      SequenceProgramMode.Halting,
      SequenceProgramMode.Pausing
    ) or self._child_program.busy

  def get_child(self, block_key: int, exec_key: None):
    assert block_key == self._child_index
    return self._child_program

  def import_message(self, message: Any):
    match message["type"]:
      case "halt":
        self.halt()
      case "jump":
        self.jump(self._block.Point.import_value(message["point"], block=self._block, master=self._master))
      case "setInterrupt":
        self.set_interrupt(message["value"])

  def halt(self):
    assert (not self.busy) and (self._mode in (SequenceProgramMode.Normal, SequenceProgramMode.Paused))

    self._mode = SequenceProgramMode.Halting
    self._child_program.halt()

  def jump(self, point: SequenceProgramPoint):
    if point.index != self._child_index:
      self._point = point
      self.halt()
    elif point.child:
      self._child_program.jump(point.child)


  def pause(self):
    assert (not self.busy) and (self._mode == SequenceProgramMode.Normal)
    self._mode = SequenceProgramMode.Pausing

    if not self._child_stopped:
      self._child_program.pause()
    else:
      self._iterator.trigger()

  def resume(self):
    assert (not self.busy) and (self._mode == SequenceProgramMode.Paused)

    self._mode = SequenceProgramMode.Resuming
    self._iterator.trigger()

  def set_interrupt(self, value: bool, /):
    self._interrupting = value
    self._iterator.trigger()

  async def run(self, initial_point: Optional[SequenceProgramPoint], symbol: ClaimSymbol):
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

    self._point = initial_point or SequenceProgramPoint(child=None, index=0)
    self._iterator = TriggerableIterator(run())

    async for event in self._iterator:
      self._child_stopped = event.stopped

      if (self._mode == SequenceProgramMode.Pausing) and event.stopped:
        self._mode = SequenceProgramMode.Paused
      if (self._mode == SequenceProgramMode.Halting) and event.stopped:
        self._mode = SequenceProgramMode.Halted
      if ((self._mode == SequenceProgramMode.Paused) and (not event.stopped)) or (self._mode == SequenceProgramMode.Resuming):
        self._mode = SequenceProgramMode.Normal

      yield ProgramExecEvent(
        location=SequenceProgramLocation(
          child=event.location,
          index=self._child_index,
          interrupting=self._interrupting,
          mode=self._mode
        ),
        stopped=(self._mode in (SequenceProgramMode.Paused, SequenceProgramMode.Halted)),
        terminated=(event.terminated and ((self._point and self._point.index >= len(self._block._children)) or (self._child_index + 1 >= len(self._block._children)) or (self._mode == SequenceProgramMode.Halted)))
      )


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

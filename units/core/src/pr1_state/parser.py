import asyncio
from dataclasses import dataclass
from enum import IntEnum
import traceback
from types import EllipsisType
from typing import Any, Optional, cast

from pr1.devices.claim import ClaimSymbol
from pr1.error import Error
from pr1.fiber.master2 import ProgramHandle, ProgramOwner, StateInstanceCollection
from pr1.fiber.segment import SegmentTransform
from pr1.reader import LocationArea
from pr1.state import StateLocation, StateRecord
from pr1.util import schema as sc
from pr1.util.decorators import debug
from pr1.util.iterators import CoupledStateIterator3
from pr1.fiber.langservice import Analysis, Attribute, BoolType
from pr1.fiber.eval import EvalEnvs, EvalStack
from pr1.fiber.parser import (BaseBlock, BaseParser, BaseTransform, BlockAttrs,
                      BlockData, BlockProgram, BlockState, BlockUnitData,
                      BlockUnitState, FiberParser, Transforms)
from pr1.fiber.process import ProgramExecEvent

from . import logger


class StateParser(BaseParser):
  namespace = "state"
  priority = 1000
  segment_attributes = {
    'settle': Attribute(
      BoolType(),
      description="Sets whether to wait for the state to settle before entering the block."
    )
  }

  def __init__(self, fiber: FiberParser):
    self._fiber = fiber

  def parse_block(self, attrs, /, adoption_stack, trace):
    return Analysis(), BlockUnitData(transforms=[StateTransform(
      parser=self,
      settle=(attrs['settle'].value if ('settle' in attrs) else False)
    )])

@debug
class StateTransform(BaseTransform):
  def __init__(self, parser: StateParser, *, settle: bool):
    self._parser = parser
    self._settle = settle

  def execute(self, state: BlockState, transforms: Transforms, *, origin_area: LocationArea):
    analysis, child = self._parser._fiber.execute(state, transforms, origin_area=origin_area)

    if isinstance(child, EllipsisType):
      return analysis, Ellipsis

    # if isinstance(child, StateBlock):
    #   return Analysis(), StateBlock(
    #     child=child.child,
    #     state=(state | child.state)
    #   )

    # for t in transforms:
    #   print(t)
    # print()

    return analysis, StateBlock(
      child=child,
      settle=self._settle,
      state=state
    )


class StateProgramMode(IntEnum):
  ApplyingState = 0
  Halted = 5
  HaltingChild = 1
  HaltingState = 2
  Normal = 3
  SuspendingState = 4

  # ApplyingState = 7
  # ApplyingStateAndWaitingForChild = 10
  # Halted = 6
  # HaltingChild = 0
  # HaltingState = 5
  # Normal = 1
  # PausingChild = 2
  # PausingState = 3
  # Paused = 4
  # ResumingState = 11
  # ResumingStateAndChild = 8
  # Starting = 12
  # WaitingForChild = 9

@dataclass(kw_only=True)
class StateProgramLocation:
  mode: StateProgramMode
  state: Optional[Any]

  def export(self):
    return {
      "mode": self.mode,
      "state": self.state and self.state.export()
    }

@dataclass(kw_only=True)
class StateProgramPoint:
  child: Any

  @classmethod
  def import_value(cls, data: Any, /, block: 'StateBlock', *, master):
    return cls(
      child=(block.child.Point.import_value(data["child"], block.child, master=master) if data["child"] is not None else None)
    )

class StateProgram(BlockProgram):
  _next_index = 0

  def __init__(self, block: 'StateBlock', handle):
    self._index = self._next_index
    type(self)._next_index += 1

    self._logger = logger.getChild(f"stateProgram{self._index}")

    self._block = block
    self._handle = handle

    self._child_program: ProgramOwner
    # self._mode: StateProgramMode
    self._point: Optional[StateProgramPoint]
    self._state_location: Optional[StateLocation]

  @property
  def _mode(self):
    return self._mode_value

  @_mode.setter
  def _mode(self, value):
    self._logger.debug(f"\x1b[33m[{self._index}] Mode: {self._mode.name if hasattr(self, '_mode_value') else '<none>'} → {value.name}\x1b[0m")
    self._mode_value = value

  @property
  def busy(self):
    return (self._mode not in (StateProgramMode.Normal, StateProgramMode.Paused)) or self._child_program.busy

  def import_message(self, message: Any):
    match message["type"]:
      case "pause":
        self.pause()
      case "resume":
        self.resume()

  def halt(self):
    self._mode = StateProgramMode.HaltingChild
    self._child_program.halt()

  def pause(self):
    assert (not self.busy) and (self._mode == StateProgramMode.Normal)
    self._mode = StateProgramMode.PausingChild

    if not self._child_stopped:
      self._child_program.pause()
    else:
      self._iterator.trigger()

  def resume(self):
    assert (not self.busy) and (self._mode == StateProgramMode.Paused)

    self._mode = StateProgramMode.ResumingState

    async def resume():
      try:
        await self.call_resume()
      except Exception:
        traceback.print_exc()

    asyncio.create_task(resume())

    # self._iterator.trigger()

  async def call_resume(self):
    if self._mode == StateProgramMode.Normal:
      self._master.transfer_state(); print("X: State2")
    else:
      self._state_instance.prepare(resume=True)
      await super().call_resume()

      if self._mode != StateProgramMode.ResumingState:
        self._mode = StateProgramMode.ResumingStateAndChild

      self._iterator.trigger()

      self._state_settled_future = asyncio.Future()
      await self._state_settled_future

  def _update(self, record: StateRecord, *, update: bool):
    self._state_location = record.location

    self._handle.send(ProgramExecEvent(
      errors=[error.as_master() for error in record.errors],
      location=StateProgramLocation(
        mode=self._mode,
        state=self._state_location
      )
    ), update=update)

  async def run(self, stack):
    manager = self._handle.master.state_manager

    # Evaluate expressions
    result = manager.add(self._handle, self._block.state, stack=stack, update=self._update)

    if self._block.settle:
      future = manager.apply(self._handle)

      if future:
        self._mode = StateProgramMode.ApplyingState
        self._handle.master.update_soon()
        await future

    self._mode = StateProgramMode.Normal
    self._child_program = self._handle.create_child(self._block.child)

    await self._child_program.run(stack)

    self._mode = StateProgramMode.SuspendingState

    await manager.suspend(self._handle)
    await manager.remove(self._handle)

    self._mode = StateProgramMode.Halted


@debug
class StateBlock(BaseBlock):
  Point: type[StateProgramPoint] = StateProgramPoint
  Program = StateProgram

  def __init__(self, child: BaseBlock, state: BlockState, *, settle: bool):
    self.child = child
    self.settle = settle
    self.state: BlockState = state # TODO: Remove explicit type hint

  def export(self):
    return {
      "namespace": "state",

      "child": self.child.export(),
      "state": self.state.export()
    }

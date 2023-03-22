from asyncio import Event
from dataclasses import dataclass
from enum import IntEnum
from logging import Logger
from types import EllipsisType
from typing import Any, Optional

from pr1.fiber.langservice import Analysis, Attribute, BoolType
from pr1.fiber.master2 import ProgramHandle, ProgramOwner
from pr1.fiber.parser import (BaseBlock, BaseParser, BaseTransform, BlockState,
                              BlockUnitData, FiberParser, HeadProgram,
                              Transforms)
from pr1.fiber.process import ProgramExecEvent
from pr1.reader import LocationArea
from pr1.state import StateLocation, StateRecord
from pr1.util.asyncio import DualEvent, run_anonymous
from pr1.util.decorators import debug, provide_logger

from . import logger


class StateParser(BaseParser):
  namespace = "state"
  priority = 1000
  segment_attributes = {
    'settle': Attribute(
      BoolType(),
      description="Sets whether to wait for the state to settle before entering the block. Always true for the deepest states."
    ),
    'stable': Attribute(
      BoolType(),
      description="Sets whether this state should be use as a fallback when an error occurs. Always true for the root states."
    )
  }

  def __init__(self, fiber: FiberParser):
    self._fiber = fiber

  def parse_block(self, attrs, /, adoption_stack, trace):
    return Analysis(), BlockUnitData(transforms=[StateTransform(
      parser=self,
      settle=(attrs['settle'].value if ('settle' in attrs) else False),
      stable=(attrs['stable'].value if ('stable' in attrs) else False)
    )])

@debug
class StateTransform(BaseTransform):
  def __init__(self, parser: StateParser, *, settle: bool, stable: bool):
    self._parser = parser
    self._settle = settle
    self._stable = stable

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
      stable=self._stable,
      state=state
    )


class StateProgramMode(IntEnum):
  AbortedState = 0
  ApplyingState = 9
  HaltingChildThenState = 12
  HaltingChildWhilePaused = 1
  HaltingState = 2
  Normal = 3
  Paused = 8
  PausingChild = 4
  PausingState = 5
  ResumingParent = 11
  ResumingState = 10
  SuspendingState = 6
  Terminated = 7

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

@provide_logger(logger)
class StateProgram(HeadProgram):
  def __init__(self, block: 'StateBlock', handle):
    self._logger: Logger

    self._block = block
    self._handle = handle

    self._child_program: ProgramOwner
    # self._mode: StateProgramMode
    self._bypass_event = Event()
    self._interrupted_event = DualEvent()
    # self._interrupting = False
    self._point: Optional[StateProgramPoint]
    self._state_location: Optional[StateLocation] = None

  @property
  def _state_manager(self):
    return self._handle.master.state_manager

  @property
  def _mode(self):
    return self._mode_value

  @_mode.setter
  def _mode(self, value):
    self._logger.debug(f"\x1b[33mMode: {self._mode.name if hasattr(self, '_mode_value') else '<none>'} → {value.name}\x1b[0m")
    self._mode_value = value

  # @property
  # def busy(self):
  #   return (self._mode not in (StateProgramMode.Normal, StateProgramMode.Paused)) or self._child_program.busy

  def receive(self, message: Any):
    self._logger.debug(f"\x1b[33mReceived message: {message}\x1b[0m")

    match message["type"]:
      case _:
        super().receive(message)

  def halt(self):
    match self._mode:
      case StateProgramMode.AbortedState:
        self._bypass_event.set()
      case StateProgramMode.Normal:
        self._mode = StateProgramMode.HaltingChildThenState
        self._child_program.halt()
      case StateProgramMode.Paused:
        self._mode = StateProgramMode.HaltingChildWhilePaused
        self._child_program.halt()
      case _:
        raise AssertionError

    self._handle.send(ProgramExecEvent(location=self._location))

  async def pause(self):
    match self._mode:
      # Doing something else
      # case StateProgramMode.ApplyingState:
      #   self._interrupting = True
      #   await self._interrupted_event.wait_set()
      #   return True

      # Doing something else
      case StateProgramMode.ApplyingState | StateProgramMode.ResumingParent | StateProgramMode.ResumingState:
        return False

      # Already paused
      case StateProgramMode.AbortedState | StateProgramMode.HaltingChildWhilePaused | StateProgramMode.Paused | StateProgramMode.Terminated:
        await self._interrupted_event.wait_set()
        return True

      # Already pausing
      case StateProgramMode.HaltingChildThenState | StateProgramMode.HaltingState | StateProgramMode.PausingChild | StateProgramMode.PausingState | StateProgramMode.SuspendingState:
        await self._interrupted_event.wait_set()
        return True

      # Can pause
      case StateProgramMode.Normal:
        self._mode = StateProgramMode.PausingChild
        self._handle.send(ProgramExecEvent(location=self._location))

        await self._handle.pause_children()

        self._mode = StateProgramMode.PausingState
        self._handle.send(ProgramExecEvent(location=self._location))

        await self._state_manager.suspend(self._handle)
        await self._state_manager.clear(self._handle)

        self._mode = StateProgramMode.Paused
        self._handle.send(ProgramExecEvent(location=self._location))

        self._interrupted_event.set()
        return True

      case _:
        return False

  async def resume(self, *, loose):
    if self._mode != StateProgramMode.Paused:
      if loose:
        return

      raise AssertionError

    self._interrupted_event.unset()

    self._mode = StateProgramMode.ResumingParent
    self._handle.send(ProgramExecEvent(location=self._location))

    try:
      await self._handle.resume_parent()
    except Exception:
      # Set the mode back to Paused if the parent could not be resumed, e.g. because it is being paused.
      self._mode = StateProgramMode.Paused
      raise

    if self._block.settle or (not loose):
      self._mode = StateProgramMode.ResumingState
      self._handle.send(ProgramExecEvent(location=self._location))

      await self._state_manager.apply(self._handle, terminal=(not loose))

    self._mode = StateProgramMode.Normal
    self._handle.send(ProgramExecEvent(location=self._location))

  def stable(self):
    return self._block.stable

  @property
  def _location(self):
    return StateProgramLocation(
      mode=self._mode,
      state=self._state_location
    )

  def _update(self, record: StateRecord):
    self._state_location = record.location

    if record.failure:
      run_anonymous(self._handle.pause_stable())

    self._handle.send(ProgramExecEvent(
      analysis=record.analysis,
      location=self._location
    ))

  async def run(self, stack):
    analysis, result = self._state_manager.add(self._handle, self._block.state, stack=stack, update=self._update)

    if isinstance(result, EllipsisType):
      self._interrupted_event.set()
      self._mode = StateProgramMode.AbortedState

      self._handle.send(ProgramExecEvent(
        analysis=analysis,
        location=self._location
      ))

      await self._state_manager.clear(self._handle)
      # await self._handle.pause_stable()

      await self._bypass_event.wait()
    else:
      if self._block.settle:
        self._mode = StateProgramMode.ApplyingState
        await self._state_manager.apply(self._handle)

        # if self._interrupting:
        #   self._interrupting = False
        #   self._mode = StateProgramMode.SuspendingState
        #   await self._state_manager.suspend(self._handle)

        self._mode = StateProgramMode.Normal
        self._handle.send(ProgramExecEvent(location=self._location))
      else:
        self._mode = StateProgramMode.Normal
        self._handle.send(ProgramExecEvent(location=self._location))

      self._child_program = self._handle.create_child(self._block.child)

      await self._child_program.run(stack)

      if self._mode not in (StateProgramMode.HaltingChildWhilePaused, StateProgramMode.Paused):
        self._mode = StateProgramMode.SuspendingState
        await self._state_manager.suspend(self._handle)

    await self._state_manager.remove(self._handle)

    self._mode = StateProgramMode.Terminated
    self._handle.send(ProgramExecEvent(location=self._location))

    self._interrupted_event.set()


@debug
class StateBlock(BaseBlock):
  Point: type[StateProgramPoint] = StateProgramPoint
  Program = StateProgram

  def __init__(self, child: BaseBlock, state: BlockState, *, settle: bool, stable: bool):
    self.child = child
    self.settle = settle
    self.stable = stable
    self.state: BlockState = state # TODO: Remove explicit type hint

  def export(self):
    return {
      "namespace": "state",

      "child": self.child.export(),
      "state": self.state.export(),

      "settle": self.settle,
      "stable": self.stable
    }

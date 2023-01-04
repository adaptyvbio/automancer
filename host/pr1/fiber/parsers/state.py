import asyncio
from dataclasses import dataclass
from enum import IntEnum
import traceback
from types import EllipsisType
from typing import Any, Optional

from ...devices.claim import ClaimSymbol
from ...reader import LocationArea
from ...util import schema as sc
from ...util.decorators import debug
from ...util.iterators import CoupledStateIterator2
from ..langservice import Analysis
from ..eval import EvalEnvs, EvalStack
from ..parser import (BaseBlock, BaseParser, BaseTransform, BlockAttrs,
                      BlockData, BlockProgram, BlockState, BlockUnitData,
                      BlockUnitState, FiberParser, Transforms)
from ..process import ProgramExecEvent


class StateParser(BaseParser):
  namespace = "state"

  def __init__(self, fiber: FiberParser):
    self._fiber = fiber

  def parse_block(self, block_attrs: BlockAttrs, /, adoption_envs: EvalEnvs, adoption_stack: EvalStack, runtime_envs: EvalEnvs) -> tuple[Analysis, BlockUnitData | EllipsisType]:
    return Analysis(), BlockUnitData(transforms=[StateTransform(parser=self)])

@debug
class StateTransform(BaseTransform):
  def __init__(self, parser: StateParser):
    self._parser = parser

  def execute(self, state: BlockState, transforms: Transforms, *, origin_area: LocationArea):
    child = self._parser._fiber.execute(state, transforms, origin_area=origin_area)

    if isinstance(child, EllipsisType):
      return Analysis(), Ellipsis

    # if isinstance(child, StateBlock):
    #   return Analysis(), StateBlock(
    #     child=child.child,
    #     state=(state | child.state)
    #   )

    return Analysis(), StateBlock(
      child=child,
      state=state
    )


class StateProgramMode(IntEnum):
  Halted = -1
  Resuming = -2

  HaltingChild = 0
  HaltingState = 5
  Normal = 1
  PausingChild = 2
  PausingState = 3
  Paused = 4

@dataclass(kw_only=True)
class StateProgramLocation:
  child: Any
  mode: StateProgramMode
  state: Any

  def export(self):
    return {
      "child": self.child.export(),
      "mode": self.mode,
      "state": self.state.export()
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
  def __init__(self, block: 'StateBlock', master, parent):
    self._block = block
    self._master = master
    self._parent = parent

    self._child_program: BlockProgram
    self._child_stopped: bool
    self._iterator: CoupledStateIterator2[ProgramExecEvent, Any]
    self._mode: StateProgramMode
    self._point: Optional[StateProgramPoint]

  @property
  def busy(self):
    return (self._mode not in (StateProgramMode.Normal, StateProgramMode.Paused)) or self._child_program.busy

  def import_message(self, message: Any):
    match message["type"]:
      case "pause":
        self.pause()
      case "resume":
        self.resume()

  def get_child(self, block_key: None, exec_key: None):
    return self._child_program

  def halt(self):
    assert not self.busy
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

    self._mode = StateProgramMode.Resuming
    self._iterator.trigger()

  async def run(self, initial_point: Optional[StateProgramPoint], symbol: ClaimSymbol):
    async def run():
      while self._point:
        point = self._point
        self._point = None

        self._child_program = self._block.child.Program(self._block.child, master=self._master, parent=self)
        self._mode = StateProgramMode.Normal

        async for event in self._child_program.run(point.child, symbol):
          yield event

    self._point = initial_point or StateProgramPoint(child=None)
    self._iterator = CoupledStateIterator2(run())

    state_instance = self._master.create_instance(self._block.state, notify=self._iterator.notify, symbol=symbol)
    state_location = state_instance.apply(self._block.state, resume=False)
    self._iterator.notify(state_location)

    async def suspend_state():
      try:
        await state_instance.suspend()
      except Exception:
        traceback.print_exc()
      finally:
        match self._mode:
          case StateProgramMode.PausingState:
            self._mode = StateProgramMode.Paused
            self._iterator.trigger()
          case StateProgramMode.HaltingState:
            self._mode = StateProgramMode.Halted
            self._iterator.trigger()

    async for event, state_location in self._iterator:
      self._child_stopped = event.stopped

      # If the child was immediately paused, then no event gets emitted.
      if (self._mode == StateProgramMode.PausingChild) and event.stopped:
        self._mode = StateProgramMode.PausingState
        asyncio.create_task(suspend_state())
        continue

      # if ((self._mode == StateProgramMode.Normal) and event.terminated) \
      #   or ((self._mode == StateProgramMode.HaltingChild) and event.stopped):
      if event.terminated: # and self._mode in (StateProgramMode.HaltingChild, StateProgramMode.Normal):
        if state_instance.applied:
          # Case (1)
          #   The state instance emits events.
          #   Once we receive the first event, we yield a corresponding event with child=event.location and stopped=False.
          #   Following events will be yielded with child=None (or event.location) and stopped=False.
          #   After the state instance terminates, we will yield a final event with child=None (or event.location) and stopped=True.
          # Case (2)
          #   The state instance does not emit anything and is suspended silently.
          #   We need to yield a last event with child=event.location and stopped=True.

          self._mode = StateProgramMode.HaltingState
          asyncio.create_task(suspend_state())

          # Wait for the state instance to emit an event or terminate.
          continue
        else:
          # This is the last iteration of the loop. Same as case (2) above.
          self._mode = StateProgramMode.Halted

      if ((self._mode == StateProgramMode.Paused) and (not event.stopped)) or (self._mode == StateProgramMode.Resuming):
        self._mode = StateProgramMode.Normal
        state_location = state_instance.apply(self._block.state, resume=False)

      yield ProgramExecEvent(
        location=StateProgramLocation(
          child=event.location,
          mode=(StateProgramMode.HaltingState if self._mode == StateProgramMode.Halted else self._mode), # TODO: fix hack
          state=state_location
        ),
        stopped=(self._mode in (StateProgramMode.Paused, StateProgramMode.Halted)),
        terminated=(self._mode == StateProgramMode.Halted)
      )

      if self._mode == StateProgramMode.Halted:
        break


@debug
class StateBlock(BaseBlock):
  Point: type[StateProgramPoint] = StateProgramPoint
  Program = StateProgram

  def __init__(self, child: BaseBlock, state: BlockState):
    self.child = child
    self.state: BlockState = state # TODO: Remove explicit type hint

  def export(self):
    return {
      "namespace": "state",

      "child": self.child.export(),
      "state": self.state.export()
    }

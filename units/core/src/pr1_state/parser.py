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
    self._child_stopped: bool
    self._child_state_terminated: bool
    self._iterator: CoupledStateIterator3[ProgramExecEvent, StateRecord]
    # self._mode: StateProgramMode
    self._point: Optional[StateProgramPoint]
    self._state_location: Optional[StateLocation]
    self._state_settled_future: Optional[asyncio.Future]

  @property
  def _mode(self):
    return self._mode_value

  @_mode.setter
  def _mode(self, value):
    self._logger.debug(f"\x1b[33m[{self._index}] Mode: {self._mode.name if hasattr(self, '_mod_value') else '<none>'} → {value.name}\x1b[0m")
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
    self._handle.send(ProgramExecEvent(
      errors=[error.as_master() for error in record.errors],
      location=StateProgramLocation(
        mode=StateProgramMode.ApplyingState,
        state=record.location
      )
    ), update=update)

  async def run(self, stack):
    manager = self._handle.master.state_manager

    # Evaluate expressions
    result = manager.add(self._handle, self._block.state, stack=stack, update=self._update)

    if self._block.settle:
      future = manager.apply(self._handle)

      if future:
        self._handle.master.update_soon()
        await future

    self._child_program = self._handle.create_child(self._block.child)

    await self._child_program.run(stack)

    await manager.suspend(self._handle)
    await manager.remove(self._handle)

  async def _run(self, initial_point: Optional[StateProgramPoint], parent_state_program: Optional['StateProgram'], stack: EvalStack, symbol: ClaimSymbol):
    async def run():
      await state_settled_future

      while self._point:
        point = self._point
        self._point = None

        self._child_program = self._block.child.Program(self._block.child, master=self._master, parent=self)

        async for event in self._child_program.run(point.child, self, stack, symbol):
          yield cast(ProgramExecEvent, event)

    self._child_stopped = False
    self._child_state_terminated = False
    self._mode = StateProgramMode.Starting
    self._point = initial_point or StateProgramPoint(child=None)

    self._iterator = CoupledStateIterator3(run())
    self._iterator.trigger()

    self._state_location = None
    self._state_settled_future = asyncio.Future()
    state_settled_future = self._state_settled_future

    self._state_instance = self._master.create_instance(self._block.state, notify=self._iterator.notify, stack=stack, symbol=symbol)
    self._state_instance.prepare(resume=False)

    previous_event: Optional[ProgramExecEvent] = None

    async def suspend_state():
      try:
        self._iterator.notify(await self._state_instance.suspend())
      except Exception:
        traceback.print_exc()

    async for event, state_records in self._iterator:
      self._logger.debug(f"\x1b[1;35m[{self._index}] Event loop iteration\x1b[22;0m")
      self._logger.debug(f"  mode={self._mode!r}")
      self._logger.debug(f"  event={event}")
      self._logger.debug(f"  state_records={state_records}")

      # self._state_instance._instances['devices']._logger.info("Ok")

      last_event = event or previous_event

      state_errors = list[Error]()
      self._state_location = (state_records[-1].location if state_records else None) or self._state_location

      for state_record in state_records:
        state_errors += state_record.errors

      if event:
        previous_event = event

        # Write the state if the state child program was terminated and is not anymore, i.e. it was replaced.
        if (self._mode == StateProgramMode.Normal) and self._child_state_terminated and (not event.state_terminated):
          self._master.write_state(); print("Y: State3")

        # Write the state if the state child program was paused (but not this program) and is not anymore.
        elif (self._mode == StateProgramMode.Normal) and self._child_stopped and (not event.stopped):
          self._master.write_state(); print("Y: State1")

        # Transfer and write the state if the state child program is paused (but not this program) but not terminated.
        # This corresponds to a pause() call on the state child program, causing itself and all its ascendants to become paused.
        if (self._mode == StateProgramMode.Normal) and event.stopped and (not self._child_stopped) and (not event.state_terminated):
          self._master.transfer_state(); print("X: State1")
          self._master.write_state(); print("Y: State2")

        if self._mode == StateProgramMode.WaitingForChild:
          self._mode = StateProgramMode.Normal

        self._child_stopped = event.stopped
        self._child_state_terminated = event.state_terminated

        if event.terminated:
          if self._state_instance.applied:
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

      if (self._mode in (StateProgramMode.ApplyingState, StateProgramMode.ApplyingStateAndWaitingForChild)) and self._state_instance.settled:
        self._logger.debug("State settled")

        if self._state_settled_future:
          self._state_settled_future.set_result(None)
          self._state_settled_future = None

        if self._mode == StateProgramMode.ApplyingStateAndWaitingForChild:
          self._mode = StateProgramMode.WaitingForChild
          self._iterator.lock()

          for state_record in state_records:
            self._iterator.notify(state_record)

          continue

        self._mode = StateProgramMode.Normal

      if self._mode in (StateProgramMode.ResumingState, StateProgramMode.ResumingStateAndChild, StateProgramMode.Starting):
        apply_state_record = self._state_instance.apply(resume=(self._mode != StateProgramMode.Starting))
        self._logger.debug(f"Applied state, settled={apply_state_record.settled}")

        # If the state has been applied synchronously, skip sending the location and wait for
        # the next event.
        if apply_state_record.settled and (self._mode != StateProgramMode.ResumingState):
          # Notify and lock until an event is received from the child program.
          self._iterator.lock()
          self._iterator.notify(apply_state_record)
          self._mode = StateProgramMode.WaitingForChild

          if self._state_settled_future:
            self._state_settled_future.set_result(None)
            self._state_settled_future = None

          continue

        # Otherwise, send the location and wait for the state to settle.
        self._mode = StateProgramMode.ApplyingStateAndWaitingForChild if self._mode != StateProgramMode.ResumingState else StateProgramMode.ApplyingState
        self._state_location = apply_state_record.location
        state_errors += apply_state_record.errors

      # If the child was immediately paused, then no event gets emitted.
      if (self._mode == StateProgramMode.PausingChild) and self._child_stopped:
        self._mode = StateProgramMode.PausingState
        asyncio.create_task(suspend_state())
        continue

      if (self._mode == StateProgramMode.PausingState) and (not self._state_instance.applied):
        self._mode = StateProgramMode.Paused

      if (self._mode == StateProgramMode.HaltingState) and (not self._state_instance.applied):
        self._mode = StateProgramMode.Halted

      if self._mode == StateProgramMode.Halted:
        await self._state_instance.close()

      if event:
        yield event.inherit(
          errors=state_errors,
          location=StateProgramLocation(
            child=event.location,
            mode=(StateProgramMode.HaltingState if self._mode == StateProgramMode.Halted else self._mode), # TODO: fix hack
            state=self._state_location
          ),
          state_terminated=(self._mode == StateProgramMode.Halted),
          stopped=(self._mode in (StateProgramMode.Paused, StateProgramMode.Halted)),
          terminated=(self._mode == StateProgramMode.Halted)
        )
      else:
        yield ProgramExecEvent(
          errors=[error.as_master() for error in state_errors],
          location=StateProgramLocation(
            child=(last_event and last_event.location),
            mode=(StateProgramMode.HaltingState if self._mode == StateProgramMode.Halted else self._mode), # TODO: fix hack
            state=self._state_location
          ),
          state_terminated=(self._mode == StateProgramMode.Halted),
          stopped=(self._mode in (StateProgramMode.Paused, StateProgramMode.Halted)),
          terminated=(self._mode == StateProgramMode.Halted)
        )

      if self._mode == StateProgramMode.Halted:
        # The iterator never ends, we need to break it here.
        break


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

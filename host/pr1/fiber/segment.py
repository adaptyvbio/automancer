import asyncio
from dataclasses import dataclass
from enum import IntEnum
import time
import traceback
from types import EllipsisType
from typing import Any, AsyncIterator, Generator, Optional, Protocol, Sequence

from ..util.ref import Ref
from ..host import logger
from .process import Process, ProgramExecEvent
from .langservice import Analysis
from .parser import BaseBlock, BaseTransform, BlockProgram, BlockState, Transforms
from ..devices.claim import ClaimSymbol
from ..draft import DraftDiagnostic, DraftGenericError
from ..reader import LocationArea
from ..util.decorators import debug
from ..util.misc import Exportable


logger = logger.getChild("segment")


class RemainingTransformsError(Exception):
  def __init__(self, area: LocationArea):
    self.area = area

  def diagnostic(self):
    return DraftDiagnostic(f"Remaining transforms", ranges=self.area.ranges)


@dataclass
class SegmentProcessData:
  data: Exportable
  namespace: str

  def export(self):
    return {
      "data": self.data.export(),
      "namespace": self.namespace
    }

@debug
class SegmentTransform(BaseTransform):
  def __init__(self, namespace: str, process_data: Exportable):
    self._process = SegmentProcessData(process_data, namespace)

  def execute(self, state: BlockState, transforms: Transforms, *, origin_area: LocationArea) -> tuple[Analysis, BaseBlock | EllipsisType]:
    if transforms:
      return Analysis(errors=[RemainingTransformsError(origin_area)]), Ellipsis

    return Analysis(), SegmentBlock(
      process=self._process,
      state=state
    )


class SegmentProgramMode(IntEnum):
  Normal = 0
  Pausing = 1
  Paused = 2

@dataclass(kw_only=True)
class SegmentProgramLocation:
  mode: SegmentProgramMode
  process: Any
  time: float
  state: Optional[Any] = None

  def export(self):
    return {
      "mode": self.mode,
      "process": self.process.export(),
      "state": self.state and self.state.export(),
      "time": self.time * 1000.0
    }

class SegmentProgram(BlockProgram):
  def __init__(self, block: 'SegmentBlock', master, parent):
    self._block = block
    self._master = master
    self._parent = parent

    self._mode: SegmentProgramMode
    self._resume_future: Optional[asyncio.Future]
    self._process: Process

  def import_message(self, message: dict):
    match message["type"]:
      case "pause":
        self.pause()
      case "resume":
        self.resume()

  def pause(self):
    self._mode = SegmentProgramMode.Pausing
    self._process.pause()
    self._resume_future = asyncio.Future()

  def resume(self):
    assert self._resume_future
    self._resume_future.set_result(None)

  async def run(self, initial_state: Optional[SegmentProgramLocation], symbol: ClaimSymbol):
    runner = self._master.chip.runners[self._block._process.namespace]

    self._mode = SegmentProgramMode.Normal
    self._resume_future = None
    self._process = runner.Process(self._block._process.data)

    iterator = DoubleIterator(self._process.run(initial_state.process if initial_state else None))

    def set_hold():
      iterator.set_second(self._master.hold(self._block.state, symbol))

    set_hold()

    location: Optional[SegmentProgramLocation] = None
    state_location: Optional[Any] = None

    async for main, event in iterator:
      if main:
        event_time = event.time or time.time()

        if (self._mode == SegmentProgramMode.Pausing) and event.stopped:
          # The process is now paused.

          # Revert the state.
          await iterator.close_second()

          assert location
          location.state = None

          # Create a future that will be resolved when the process is resumed.
          self._mode = SegmentProgramMode.Paused
          self._resume_future = asyncio.Future()

        if not location:
          location = SegmentProgramLocation(
            mode=self._mode,
            process=event.state,
            state=state_location,
            time=event_time
          )
        else:
          location.mode = self._mode
          location.process = event.state
          location.time = event_time

        yield ProgramExecEvent(
          state=location,
          stopped=(self._mode == SegmentProgramMode.Paused)
        )

        if self._resume_future:
          # If the process is paused, wait for it to be resumed.
          await self._resume_future

          # Reset the mode.
          self._mode = SegmentProgramMode.Normal
          self._resume_future = None

          # Re-apply the state.
          set_hold()

      else:
        if location:
          location.state = event
          location.time = time.time()

          yield ProgramExecEvent(
            state=location,
            stopped=False
          )
        else:
          state_location = event.state


@dataclass
class LinearSegment:
  process: SegmentProcessData
  state: BlockState

@debug
class SegmentBlock(BaseBlock):
  Program = SegmentProgram

  def __init__(self, process: SegmentProcessData, state: BlockState):
    self._process = process
    self.state: BlockState = state

  def linearize(self, context, parent_state):
    return Analysis(), [LinearSegment(self._process, parent_state | self.state)]

    # analysis = Analysis()
    # state = dict()

    # for namespace, unit_state in self._segment.state.items():
    #   if unit_state and hasattr(unit_state, 'assemble'):
    #     unit_analysis, unit_state_assembled = unit_state.assemble(context)
    #     analysis += unit_analysis

    #     if unit_state_assembled is Ellipsis:
    #       return analysis, Ellipsis

    #     state[namespace] = unit_state_assembled
    #   else:
    #     state[namespace] = unit_state

    # return analysis, [Segment(
    #   process_data=self._segment.process_data,
    #   process_namespace=self._segment.process_namespace,
    #   state=BlockState(state)
    # )]

  def export(self):
    return {
      "namespace": "segment",
      "process": self._process.export(),
      "state": self.state.export()
    }


class DoubleIterator:
  def __init__(self, main: AsyncIterator):
    self._main = main
    self._main_task = None
    self._second_task = None

  async def close_second(self):
    assert self._second_task

    self._second_task.cancel()

    try:
      await self._second_task
    except (StopAsyncIteration, asyncio.CancelledError):
      pass

    self._second_task = None

    try:
      await anext(self._second)
    except StopAsyncIteration:
      pass

  def set_second(self, second: AsyncIterator):
    self._second = second

  def _callback(self, main, task):
    # print(">>>>", main, task)

    if main:
      self._main_task = None
    else:
      self._second_task = None

    try:
      value = task.result()
    except asyncio.CancelledError:
      pass
    except StopAsyncIteration:
      if main:
        def callback(_):
          self._future.set_exception(StopAsyncIteration)

        asyncio.ensure_future(self.close_second()).add_done_callback(callback)
    else:
      self._future.set_result((main, value))

  def __aiter__(self):
    return self

  async def __anext__(self):
    if not self._main_task:
      self._main_task = asyncio.create_task(anext(self._main)) # type: ignore
      self._main_task.add_done_callback(lambda task: self._callback(True, task))

    if not self._second_task:
      self._second_task = asyncio.create_task(anext(self._second)) # type: ignore
      self._second_task.add_done_callback(lambda task: self._callback(False, task))

    self._future = asyncio.Future()
    return await self._future

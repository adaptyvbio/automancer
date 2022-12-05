import asyncio
from dataclasses import dataclass
from enum import IntEnum
import time
import traceback
from types import EllipsisType
from typing import Any, AsyncIterator, Generator, Optional, Protocol, Sequence

from ..util.iterators import CoupledStateIterator2
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
from .master2 import Master


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
  PausingProcess = 1
  PausingState = 2
  Paused = 3

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
    self._master: Master = master
    self._parent = parent

    self._mode: SegmentProgramMode
    self._resume_future: Optional[asyncio.Future]
    self._process: Process

  def import_message(self, message: dict):
    match message["type"]:
      case "pause":
        self.pause()
        self._resume_future = asyncio.Future()
      case "resume":
        self.resume()

  def pause(self):
    assert self._mode == SegmentProgramMode.Normal

    self._mode = SegmentProgramMode.PausingProcess
    self._process.pause()

  def resume(self):
    assert self._mode == SegmentProgramMode.Paused
    assert self._resume_future

    self._resume_future.set_result(None)

  async def run(self, initial_state: Optional[SegmentProgramLocation], symbol: ClaimSymbol):
    runner = self._master.chip.runners[self._block._process.namespace]

    self._mode = SegmentProgramMode.Normal
    self._resume_future = None
    self._process = runner.Process(self._block._process.data)

    iterator = CoupledStateIterator2[ProgramExecEvent, Any](self._process.run(initial_state.process if initial_state else None))

    state_instance = self._master.create_instance(self._block.state, notify=iterator.notify, symbol=symbol)
    state_location = state_instance.apply(self._block.state, resume=False)
    iterator.notify(state_location)

    async for event, state_location in iterator:
      event_time = event.time or time.time()

      if (self._mode == SegmentProgramMode.PausingProcess) and event.stopped:
        self._mode = SegmentProgramMode.PausingState
        await state_instance.suspend()
        # continue

      if self._mode == SegmentProgramMode.PausingState:
        self._mode = SegmentProgramMode.Paused

      yield ProgramExecEvent(
        state=SegmentProgramLocation(
          mode=self._mode,
          process=event.state,
          state=state_location,
          time=event_time
        ),
        stopped=(self._mode == SegmentProgramMode.Paused)
      )

      if self._mode == SegmentProgramMode.Paused:
        if self._resume_future:
          # If the process is paused, wait for it to be resumed.
          await self._resume_future
          self._resume_future = None

        # Reset the mode.
        self._mode = SegmentProgramMode.Normal

        # Re-apply the state.
        state_location = state_instance.apply(self._block.state, resume=True)
        iterator.notify(state_location)

    await state_instance.suspend()


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

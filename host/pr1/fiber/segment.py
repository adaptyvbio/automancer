import asyncio
from dataclasses import dataclass
from enum import IntEnum
import time
import traceback
from types import EllipsisType
from typing import Any, Optional, Protocol, Sequence

from ..host import logger
from .process import Process, ProgramExecEvent
from .langservice import Analysis
from .master2 import BlockMesh, ClaimSymbol
from .parser import BaseBlock, BaseTransform, BlockProgram, BlockState, Transforms
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
class SegmentProgramState:
  mode: SegmentProgramMode
  process: Optional[Any]

  def export(self):
    return {
      "mode": self.mode,
      "process": self.process.export()
    }

class SegmentProgram(BlockProgram):
  def __init__(self, block: 'SegmentBlock', master, parent):
    self._block = block
    self._master = master
    self._parent = parent

    self._mode: SegmentProgramMode
    self._pause_future: Optional[asyncio.Future]
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

  def resume(self):
    assert self._pause_future
    self._pause_future.set_result(None)

  async def run(self, initial_state: Optional[SegmentProgramState], symbol: ClaimSymbol):
    loop = asyncio.get_running_loop()
    hold = loop.create_task(self._master.hold(self._block.state, symbol))

    runner = self._master.chip.runners[self._block._process.namespace]

    self._mode = SegmentProgramMode.Normal
    self._pause_future = None
    self._process = runner.Process(self._block._process.data)

    try:
      async for info in self._process.run(initial_state.process if initial_state else None):
        if (self._mode == SegmentProgramMode.Pausing) and info.stopped:
          self._mode = SegmentProgramMode.Paused
          self._pause_future = asyncio.Future()

        yield ProgramExecEvent(
          duration=info.duration,
          error=info.error,
          state=SegmentProgramState(mode=self._mode, process=info.state),
          stopped=(self._mode == SegmentProgramMode.Paused),
          time=(info.time or time.time())
        )

        if self._pause_future:
          await self._pause_future
          self._mode = SegmentProgramMode.Normal
          self._pause_future = None
    except Exception as e:
      logger.error("Uncaught error raised in process")
      logger.error(e)

      yield ProgramExecEvent(error=e)

    hold.cancel()


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

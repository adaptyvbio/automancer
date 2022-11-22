import asyncio
from dataclasses import dataclass
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

@debug
class SegmentProgramState:
  def __init__(self, process: Optional[object] = None):
    self.process = process

  def export(self):
    return {
      "process": self.process.export()
    }

@debug
class SegmentProgram(BlockProgram):
  def __init__(self, block: 'SegmentBlock', master, parent):
    self._block = block
    self._master = master
    self._parent = parent

    self._process: Process

  def pause(self):
    self._process.pause()

  async def run(self, initial_state: Optional[SegmentProgramState], symbol: ClaimSymbol):
    loop = asyncio.get_running_loop()
    hold = loop.create_task(self._master.hold(self._block.state, symbol))

    last_info: Optional[ProgramExecEvent] = None
    runner = self._master.chip.runners[self._block._process.namespace]
    self._process = runner.Process(self._block._process.data)

    try:
      async for info in self._process.run(initial_state.process if initial_state else None):
        match info.pausable, last_info:
          case None, (None | ProgramExecEvent(pausable=None)):
            pausable = hasattr(self._process, 'pause')
          case (None, ProgramExecEvent(pausable=value)) | (value, _):
            pausable = value

        yield ProgramExecEvent(
          duration=info.duration,
          error=info.error,
          pausable=pausable,
          state=SegmentProgramState(process=info.state),
          time=(info.time or time.time())
        )

        last_info = info
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
    self.state = state

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
      "segment": {
        "process": self._process.export(),
        "state": self.state.export()
      }
    }

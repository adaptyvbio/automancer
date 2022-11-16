import asyncio
import traceback
from types import EllipsisType
from typing import Any, Optional, Protocol, Sequence

from .process import Process, ProgramExecInfo
from .langservice import Analysis
from .parser import BaseBlock, BaseTransform, BlockProcessData, BlockProgram, BlockState, Transforms
from ..draft import DraftDiagnostic, DraftGenericError
from ..reader import LocationArea
from ..util.decorators import debug
from ..host import logger


logger = logger.getChild("segment")


class RemainingTransformsError(Exception):
  def __init__(self, area: LocationArea):
    self.area = area

  def diagnostic(self):
    return DraftDiagnostic(f"Remaining transforms", ranges=self.area.ranges)


@debug
class Segment:
  def __init__(self, process_data: BlockProcessData, process_namespace: str, state: BlockState):
    self.process_data = process_data
    self.process_namespace = process_namespace
    self.state = state

@debug
class SegmentTransform(BaseTransform):
  def __init__(self, namespace: str, data: BlockProcessData):
    self._data = data
    self._namespace = namespace

  def execute(self, state: BlockState, parent_state: Optional[BlockState], transforms: Transforms, *, origin_area: LocationArea) -> tuple[Analysis, BaseBlock | EllipsisType]:
    segment_state = parent_state | state

    if transforms:
      return Analysis(errors=[RemainingTransformsError(origin_area)]), Ellipsis

    return Analysis(), SegmentBlock(Segment(
      process_data=self._data,
      process_namespace=self._namespace,
      state=segment_state
    ))

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

  async def run(self, initial_state: Optional[SegmentProgramState]):
    runner = self._master.chip.runners[self._block._segment.process_namespace]
    self._process = runner.Process(self._block._segment.process_data)

    try:
      async for info in self._process.run(initial_state.process if initial_state else None):
        yield ProgramExecInfo(
          duration=info.duration,
          error=info.error,
          state=SegmentProgramState(process=info.state),
          time=info.time
        )
    except Exception as e:
      logger.error("Uncaught error raised in process")
      logger.error(e)

      yield ProgramExecInfo(error=e)


@debug
class SegmentBlock(BaseBlock):
  Program = SegmentProgram

  def __init__(self, segment: Segment):
    self._segment = segment

  # # ?
  # def __getitem__(self, key):
  #   assert key is None
  #   return self._segment

  def linearize(self, context):
    analysis = Analysis()
    state = dict()

    for namespace, unit_state in self._segment.state.items():
      if unit_state and hasattr(unit_state, 'assemble'):
        unit_analysis, unit_state_assembled = unit_state.assemble(context)
        analysis += unit_analysis

        if unit_state_assembled is Ellipsis:
          return analysis, Ellipsis

        state[namespace] = unit_state_assembled
      else:
        state[namespace] = unit_state

    return analysis, [Segment(
      process_data=self._segment.process_data,
      process_namespace=self._segment.process_namespace,
      state=BlockState(state)
    )]

  def export(self):
    return {
      "namespace": "segment",
      "segment": {
        "process": {
          "data": self._segment.process_data.export(),
          "namespace": self._segment.process_namespace
        },
        "state": {
          namespace: state and state.export() for namespace, state in self._segment.state.items()
        }
      }
    }

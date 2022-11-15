import asyncio
import traceback
from types import EllipsisType
from typing import Any, Optional, Protocol, Sequence

from .process import Process, ProcessExecStatus
from .langservice import Analysis
from .parser import BaseBlock, BaseTransform, BlockProcessData, BlockProgram, BlockState, Transforms
from ..draft import DraftDiagnostic, DraftGenericError
from ..reader import LocationArea
from ..util.decorators import debug


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
class SegmentProgram(BlockProgram):
  def __init__(self, block: 'SegmentBlock', master, parent):
    self._block = block
    self._master = master
    self._parent = parent

    self._pause_future: Optional[asyncio.Future] = None
    self._resume_future: Optional[asyncio.Future] = None

    self._process: Process
    self._status: ProcessExecStatus

  def enter(self):
    runner = self._master.chip.runners[self._block._segment.process_namespace]

    self._process = runner.Process(self._block._segment.process_data)
    self._status = ProcessExecStatus(self)

    async def process_loop():
      try:
        async for info in self._process.run(self._status, initial_state=None):
          print(">", info)

          if self._pause_future and info.stopped:
            self._pause_future.set_result(None)
            self._pause_future = None

            self._resume_future = asyncio.Future()
            await self._resume_future
        else:
          pass
      except Exception:
        traceback.print_exc()

    asyncio.create_task(process_loop())

  async def pause(self):
    self._pause_future = asyncio.Future()
    self._process.pause()

    await self._pause_future

  def resume(self):
    assert self._resume_future

    self._resume_future.set_result(None)
    self._resume_future = None


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

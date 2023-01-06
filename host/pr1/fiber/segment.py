import asyncio
from dataclasses import dataclass
from enum import IntEnum
import time
import traceback
from types import EllipsisType
from typing import Any, AsyncIterator, Generator, Optional, Protocol, Sequence

from .eval import EvalStack

from ..util.iterators import CoupledStateIterator2
from ..util.ref import Ref
from ..host import logger
from .process import Process, ProgramExecEvent
from .langservice import Analysis
from .parser import BaseBlock, BaseTransform, BlockProgram, BlockState, Transforms
from ..devices.claim import ClaimSymbol, Claimable
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

    return Analysis(), SegmentBlock(process=self._process)


class SegmentProgramMode(IntEnum):
  Halted = -1

  Halting = 0
  Normal = 1
  Pausing = 2
  Paused = 3

@dataclass(kw_only=True)
class SegmentProgramLocation:
  mode: SegmentProgramMode
  process: Any
  time: float

  def export(self):
    return {
      "mode": self.mode,
      "process": self.process.export(),
      "time": self.time * 1000.0
    }

@dataclass(kw_only=True)
class SegmentProgramPoint:
  process: Optional[Any]

  @classmethod
  def import_value(cls, data: Any, /, block: 'SegmentBlock', *, master):
    return cls(process=None)

class SegmentProgram(BlockProgram):
  def __init__(self, block: 'SegmentBlock', master, parent):
    self._block = block
    self._master: Master = master
    self._parent = parent

    self._mode: SegmentProgramMode
    self._point: Optional[SegmentProgramPoint]
    self._process: Process

  @property
  def busy(self):
    return self._mode == SegmentProgramMode.Pausing

  def import_message(self, message: dict):
    match message["type"]:
      case "halt":
        self.halt()
      case "jump":
        self.jump(self._block.Point.import_value(message["point"], block=self._block, master=self._master))
      case "pause":
        self.pause()
      case "resume":
        self.resume()

  def halt(self):
    assert (not self.busy) and (self._mode in (SegmentProgramMode.Normal, SegmentProgramMode.Paused))

    self._mode = SegmentProgramMode.Halting
    self._process.halt()

  def jump(self, point: SegmentProgramPoint):
    assert (not self.busy) and (self._mode == SegmentProgramMode.Normal)

    if hasattr(self._process, 'jump'):
      self._process.jump(point.process)
    else:
      self._point = point
      self.halt()

  def pause(self):
    assert (not self.busy) and (self._mode == SegmentProgramMode.Normal)

    self._mode = SegmentProgramMode.Pausing
    self._process.pause()

  def resume(self):
    assert (not self.busy) and (self._mode == SegmentProgramMode.Paused)
    self._process.resume()

  async def run(self, initial_point: Optional[SegmentProgramPoint], parent_state_program, stack: EvalStack, symbol: ClaimSymbol):
    Process = self._master.chip.runners[self._block._process.namespace].Process
    self._point = initial_point or SegmentProgramPoint(process=None)

    async def run():
      while self._point:
        point = self._point
        self._mode = SegmentProgramMode.Normal
        self._point = None
        self._process = Process(self._block._process.data)

        # self._master.host.root_node.transfer_claims()

        async for event in self._process.run(point.process):
          yield event

    async for event in run():
      event_time = event.time or time.time()

      if (self._mode == SegmentProgramMode.Pausing) and event.stopped:
        self._mode = SegmentProgramMode.Paused
      if (self._mode == SegmentProgramMode.Paused) and (not event.stopped):
        self._mode = SegmentProgramMode.Normal

      halted = (self._mode == SegmentProgramMode.Halting) and event.stopped

      yield ProgramExecEvent(
        location=SegmentProgramLocation(
          mode=self._mode,
          process=event.location,
          time=event_time
        ),
        stopped=event.stopped,

        # Allow processes to implicitly have terminated=True when halted
        terminated=(event.terminated or halted)
      )

      if halted:
        self._mode = SegmentProgramMode.Halted


@dataclass
class LinearSegment:
  process: SegmentProcessData
  state: BlockState

@debug
class SegmentBlock(BaseBlock):
  Point: type[SegmentProgramPoint] = SegmentProgramPoint
  Program = SegmentProgram

  def __init__(self, process: SegmentProcessData):
    self._process = process

  def export(self):
    return {
      "namespace": "segment",
      "process": self._process.export()
    }

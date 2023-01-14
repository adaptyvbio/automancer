import asyncio
from dataclasses import dataclass
from enum import IntEnum
import time
import traceback
from types import EllipsisType
from typing import Any, AsyncIterator, Generator, Optional, Protocol, Sequence, cast

from .eval import EvalStack

from ..host import logger
from .process import Process, ProcessEvent, ProcessExecEvent, ProcessFailureEvent, ProcessPauseEvent, ProcessTerminationEvent, ProgramExecEvent
from .langservice import Analysis
from .parser import BaseBlock, BaseTransform, BlockProgram, BlockState, Transforms
from ..devices.claim import ClaimSymbol
from ..draft import DraftDiagnostic
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
  Starting = -1
  Terminated = -2

  Broken = 0
  Halting = 1
  Normal = 2
  Pausing = 3
  Paused = 4

@dataclass(kw_only=True)
class SegmentProgramLocation:
  error: Optional[Any]
  mode: SegmentProgramMode
  pausable: bool
  process: Any
  time: float

  def export(self):
    return {
      "mode": self.mode,
      "pausable": self.pausable,
      "process": self.process.export(),
      "time": self.time * 1000.0
    }

@dataclass(kw_only=True)
class SegmentProgramPoint:
  process: Optional[Any]

  @classmethod
  def import_value(cls, data: Any, /, block: 'SegmentBlock', *, master):
    return cls(process=None)


class ProcessError(Exception):
  pass

class ProcessInternalError(ProcessError):
  def __init__(self, exception: Exception, /):
    self.exception = exception

class ProcessProtocolError(ProcessError):
  def __init__(self, message: str, /):
    self.message = message


class SegmentProgram(BlockProgram):
  def __init__(self, block: 'SegmentBlock', master, parent):
    self._block = block
    self._master: Master = master
    self._parent = parent

    self._mode: SegmentProgramMode
    self._point: Optional[SegmentProgramPoint]
    self._process: Process

  @property
  def _settled(self):
    return self._mode in (SegmentProgramMode.Broken, SegmentProgramMode.Terminated)

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

    self.call_resume()
    self._process.resume()

  async def run(self, initial_point: Optional[SegmentProgramPoint], parent_state_program, stack: EvalStack, symbol: ClaimSymbol):
    runner = self._master.chip.runners[self._block._process.namespace]

    self._point = initial_point or SegmentProgramPoint(process=None)
    self._master.transfer_state(); print("X: Segment")

    process_location: Optional[Exportable] = None
    process_pausable: bool = False

    async def run():
      while self._point:
        point = self._point
        self._mode = SegmentProgramMode.Normal
        self._point = None
        self._process = runner.Process(self._block._process.data, runner=runner)

        try:
          async for event in self._process.run(point.process, stack=stack):
            yield cast(ProcessEvent, event) # TODO: Remove
        except Exception as e:
          yield ProcessInternalError(e)

        if self._mode not in (SegmentProgramMode.Broken, SegmentProgramMode.Terminated):
          yield ProcessProtocolError(f"Process returned without sending a {type(ProcessFailureEvent)} or {type(ProcessTerminationEvent)} event")

    async for event in run():
      event_errors = list()
      event_time = None
      location_error: Optional[Any] = None

      try:
        if isinstance(event, ProcessError):
          raise event

        event_time = event.time
        process_location = event.location or process_location

        if event.errors:
          event_errors += event.errors

        if self._mode in (SegmentProgramMode.Broken, SegmentProgramMode.Terminated):
          raise ProcessProtocolError(f"Process sent a {type(event).__name__} event while terminated")

        match event:
          case ProcessExecEvent(pausable=pausable):
            if self._mode == SegmentProgramMode.Starting:
              if not process_location:
                raise ProcessProtocolError(f"Process sent a {ProcessExecEvent.__name__} event with a falsy location while starting")

              self._mode = SegmentProgramMode.Normal

            if pausable is not None:
              process_pausable = pausable

          case ProcessFailureEvent(error=error):
            self._mode = SegmentProgramMode.Broken
            location_error = error

          case ProcessPauseEvent():
            if self._mode != SegmentProgramMode.Pausing:
              raise ProcessProtocolError(f"Process sent a {ProcessPauseEvent.__name__} event not while pausing")

            self._mode = SegmentProgramMode.Paused

          case ProcessTerminationEvent():
            self._mode = SegmentProgramMode.Terminated

          case _:
            raise ProcessProtocolError(f"Process sent an invalid object")

      except (ProcessInternalError, ProcessProtocolError) as e:
        logger.error(f"Process protocol error: {e}")

        # Cancel the jump request, if any
        self._point = None

        if self._mode == SegmentProgramMode.Terminated:
          logger.error(f"This error cannot be reported to the user.")
          continue
        else:
          self._mode = SegmentProgramMode.Broken

          event_errors.append(e)
          location_error = e

          yield ProgramExecEvent(
            errors=[e]
          )

      event_time = event_time or time.time()

      yield ProgramExecEvent(
        errors=event_errors,
        location=SegmentProgramLocation(
          error=location_error,
          mode=self._mode,
          pausable=process_pausable,
          process=process_location,
          time=event_time
        ),
        partial=True,
        stopped=(self._mode in (SegmentProgramMode.Broken, SegmentProgramMode.Paused, SegmentProgramMode.Terminated)),
        state_terminated=(self._mode == SegmentProgramMode.Terminated),
        terminated=(self._mode == SegmentProgramMode.Terminated)
      )


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

import asyncio
from asyncio import Event, Future
from dataclasses import dataclass
from enum import IntEnum
import time
import traceback
from types import EllipsisType
from typing import Any, AsyncIterator, Generator, Optional, Protocol, Sequence, cast

from .eval import EvalStack
from ..host import logger
from ..error import Error
from ..master.analysis import MasterAnalysis, MasterError
from .process import Process, ProcessEvent, ProcessExecEvent, ProcessFailureEvent, ProcessPauseEvent, ProcessTerminationEvent, ProgramExecEvent
from .langservice import Analysis
from .parser import BaseBlock, BaseTransform, BlockProgram, BlockState, HeadProgram, Transforms
from ..devices.claim import ClaimSymbol
from ..draft import DraftDiagnostic
from ..reader import LocationArea
from ..util.decorators import debug
from ..util.misc import Exportable, UnreachableError
from ..util.asyncio import run_anonymous
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
  ApplyingState = 5
  Broken = 0
  FailedState = 10
  Halting = 1
  Normal = 2
  Pausing = 3
  Paused = 4
  ResumingParent = 8
  ResumingProcess = 9
  Starting = 6
  Terminated = 7

@dataclass(kw_only=True)
class SegmentProgramLocation:
  error: Optional[Error]
  mode: SegmentProgramMode
  pausable: bool
  process: Optional[Exportable]
  time: float

  def export(self):
    return {
      "error": self.error and self.error.export(),
      "mode": self.mode,
      "pausable": self.pausable,
      "process": self.process and self.process.export(),
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


class SegmentProgram(HeadProgram):
  def __init__(self, block: 'SegmentBlock', handle):
    self._block = block
    self._handle = handle

    self._mode: SegmentProgramMode
    self._point: Optional[SegmentProgramPoint]
    self._process: Process

    self._bypass_future: Optional[Future]
    self._pause_event: Optional[Event]
    self._resume_event: Optional[Event]

  @property
  def _location(self):
    return SegmentProgramLocation(
      error=None,
      mode=self._mode,
      pausable=self._process_pausable,
      process=self._process_location,
      time=self._process_time
    )

  @property
  def _settled(self):
    return self._mode in (SegmentProgramMode.Broken, SegmentProgramMode.Terminated)

  @property
  def _state_manager(self):
    return self._handle.master.state_manager

  @property
  def busy(self):
    return self._mode == SegmentProgramMode.Pausing

  # def import_message(self, message: dict):
  #   match message["type"]:
  #     case "jump":
  #       self.jump(self._block.Point.import_value(message["point"], block=self._block, master=self._master))

  def halt(self):
    match self._mode:
      case SegmentProgramMode.Broken:
        run_anonymous(self.resume(loose=False))
      case SegmentProgramMode.FailedState:
        self._mode = SegmentProgramMode.Halting

        assert self._bypass_future
        self._bypass_future.set_result(None)
        self._bypass_future = None
      case SegmentProgramMode.Normal | SegmentProgramMode.Paused:
        self._mode = SegmentProgramMode.Halting
        self._process.halt()
      case _:
        raise AssertionError

  def jump(self, point: SegmentProgramPoint):
    assert (not self.busy) and (self._mode == SegmentProgramMode.Normal)

    if hasattr(self._process, 'jump'):
      self._process.jump(point.process)
    else:
      self._point = point
      self.halt()

  async def pause(self):
    if self._mode != SegmentProgramMode.Normal:
      return False

    self._mode = SegmentProgramMode.Pausing
    self._handle.send(ProgramExecEvent(location=self._location), lock=True)

    self._pause_event = Event()
    self._process.pause()

    await self._pause_event.wait()
    self._handle.release_lock()

    return True

  async def resume(self, *, loose):
    match self._mode:
      case SegmentProgramMode.Broken:
        assert self._bypass_future
        self._bypass_future.set_result(None)
        self._bypass_future = None
      case SegmentProgramMode.FailedState:
        assert self._bypass_future
        self._bypass_future.set_result(None)
        self._bypass_future = None
      case SegmentProgramMode.Paused:
        self._mode = SegmentProgramMode.ResumingParent
        self._handle.send(ProgramExecEvent(location=self._location))

        try:
          await self._handle.resume_parent()
        except Exception:
          self._mode = SegmentProgramMode.Paused
          raise

        self._mode = SegmentProgramMode.ApplyingState
        self._handle.send(ProgramExecEvent(location=self._location))

        failed = await self._state_manager.apply(self._handle, terminal=True)

        if failed:
          self._mode = SegmentProgramMode.Paused
          self._handle.send(ProgramExecEvent(location=self._location))

          return

        self._mode = SegmentProgramMode.ResumingProcess
        self._handle.send(ProgramExecEvent(location=self._location), lock=True)

        self._process.resume()
        self._resume_event = Event()
        await self._resume_event.wait()
      case _:
        raise AssertionError

  async def run(self, stack: EvalStack):
    initial_point = None
    runner = self._handle.master.chip.runners[self._block._process.namespace]

    self._point = initial_point or SegmentProgramPoint(process=None)
    self._process_location: Optional[Exportable] = None

    self._bypass_future = None
    self._pause_event = None
    self._resume_event = None

    self._process_pausable: bool = False
    self._process_time: float = 0.0

    self._mode = SegmentProgramMode.ApplyingState
    self._handle.send(ProgramExecEvent(location=self._location))

    await self._state_manager.apply(self._handle, terminal=True)


    async def run():
      while self._point:
        point = self._point
        self._mode = SegmentProgramMode.Normal
        self._point = None

        RunnerProcess = runner.Process
        assert RunnerProcess

        self._process = RunnerProcess(self._block._process.data, runner=runner)

        try:
          async for event in self._process.run(point.process, stack=stack):
            yield event
        except Exception as e:
          yield ProcessInternalError(e)

        if self._mode not in (SegmentProgramMode.Broken, SegmentProgramMode.Terminated):
          yield ProcessProtocolError(f"Process returned without sending a {ProcessFailureEvent.__name__} or {ProcessTerminationEvent.__name__} event")

    async for event in run():
      event_analysis = MasterAnalysis()
      event_time = None
      location_error: Optional[Any] = None

      was_pausing = (self._mode == SegmentProgramMode.Pausing)

      if self._mode == SegmentProgramMode.ResumingProcess:
        self._handle.release_lock()

      try:
        if isinstance(event, ProcessError):
          raise event

        event_analysis += event.analysis
        event_time = event.time
        self._process_location = event.location or self._process_location

        if self._mode in (SegmentProgramMode.Broken, SegmentProgramMode.Terminated):
          raise ProcessProtocolError(f"Process sent a {type(event).__name__} event while terminated")

        match event:
          case ProcessExecEvent(pausable=pausable):
            if self._mode == SegmentProgramMode.Starting:
              if not self._process_location:
                raise ProcessProtocolError(f"Process sent a {ProcessExecEvent.__name__} event with a falsy location while starting")

            if self._mode == SegmentProgramMode.ResumingProcess:
              assert self._resume_event
              self._resume_event.set()
              self._resume_event = None

              self._mode = SegmentProgramMode.Normal

            # TODO: Check if mode is valid

            if pausable is not None:
              self._process_pausable = pausable

          case ProcessFailureEvent(error=error):
            self._mode = SegmentProgramMode.Broken
            location_error = error or event.analysis.errors[0]

          case ProcessPauseEvent():
            if self._mode != SegmentProgramMode.Pausing:
              raise ProcessProtocolError(f"Process sent a {ProcessPauseEvent.__name__} event not while pausing")

            self._mode = SegmentProgramMode.Paused

            if self._pause_event:
              self._pause_event.set()

          case ProcessTerminationEvent():
            self._mode = SegmentProgramMode.Terminated

          case _:
            raise ProcessProtocolError(f"Process sent an invalid object")

      except (ProcessInternalError, ProcessProtocolError) as e:
        logger.error(f"Process protocol error: {e}")

        if isinstance(e, ProcessInternalError):
          for line in str().join(traceback.format_exception(e.exception)).splitlines():
            logger.debug(line)

        # Cancel the jump request, if any.
        self._point = None

        if self._mode == SegmentProgramMode.Terminated:
          logger.error(f"This error cannot be reported to the user.")
          continue
        else:
          self._mode = SegmentProgramMode.Broken

          match e:
            case ProcessInternalError():
              err = MasterError("Process internal error")
            case ProcessProtocolError():
              err = MasterError(e.message)
            case _:
              raise UnreachableError()

          event_analysis.errors.append(err)
          location_error = err

      if was_pausing and (self._mode != SegmentProgramMode.Paused):
        self._handle.release_lock()

      event_time = event_time or time.time()
      self._process_time = event_time

      self._handle.send(ProgramExecEvent(
        analysis=event_analysis,
        location=SegmentProgramLocation(
          error=location_error,
          mode=self._mode,
          pausable=self._process_pausable,
          process=self._process_location,
          time=event_time
        )
      ))

      if self._mode == SegmentProgramMode.Broken:
        self._bypass_future = Future()
        await self._bypass_future

        self._mode = SegmentProgramMode.Terminated
        self._handle.send(ProgramExecEvent(
          location=SegmentProgramLocation(
            error=location_error,
            mode=self._mode,
            pausable=self._process_pausable,
            process=None,
            time=event_time
          )
        ))

        break


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

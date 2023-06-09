from abc import ABC, abstractmethod, abstractstaticmethod
from asyncio import Event
from dataclasses import dataclass, field
import math
import time
from types import EllipsisType
from typing import TYPE_CHECKING, Any, AsyncIterator, ClassVar, Generic, Optional, Self, TypeVar

from ..eta import DatetimeTerm, DurationTerm

from ..error import Diagnostic
from ..reader import PossiblyLocatedValue
from .expr import Evaluable
from ..host import logger
from ..master.analysis import RuntimeAnalysis
from ..util.decorators import provide_logger
from ..util.misc import Exportable, UnreachableError, log_exception
from .eval import EvalContext, EvalStack
from .parser import BaseBlock, HeadProgram

if TYPE_CHECKING:
  from .master2 import Master


@dataclass(kw_only=True)
class ProgramExecEvent:
  analysis: RuntimeAnalysis = field(default_factory=RuntimeAnalysis)
  location: Optional[Exportable] = None
  time: Optional[float] = None


@dataclass(kw_only=True)
class BaseProcessEvent:
  analysis: RuntimeAnalysis = field(default_factory=RuntimeAnalysis)
  location: Optional[Exportable] = None
  time: Optional[float] = None

@dataclass(kw_only=True)
class ProcessExecEvent(BaseProcessEvent):
  duration: Optional[DurationTerm] = None
  pausable: Optional[bool] = None

@dataclass(kw_only=True)
class ProcessPauseEvent(BaseProcessEvent):
  duration: Optional[DurationTerm] = None

@dataclass(kw_only=True)
class ProcessFailureEvent(BaseProcessEvent):
  pass

@dataclass(kw_only=True)
class ProcessTerminationEvent(BaseProcessEvent):
  pass

ProcessEvent = ProcessExecEvent | ProcessFailureEvent | ProcessPauseEvent | ProcessTerminationEvent


class BaseProcessPoint(ABC):
  pass


T_ProcessData = TypeVar('T_ProcessData')
S_ProcessPoint = TypeVar('S_ProcessPoint', bound=BaseProcessPoint)

class BaseProcess(ABC, Generic[T_ProcessData, S_ProcessPoint]):
  name: ClassVar[str]
  namespace: ClassVar[str]

  Point: ClassVar[Optional[type[BaseProcessPoint]]] = None

  def __init__(self, data: T_ProcessData, /, master: 'Master'):
    ...

  def halt(self) -> Optional[bool]:
    return None

  def jump(self, point: S_ProcessPoint, /) -> bool:
    return False

  def pause(self):
    pass

  def resume(self):
    pass

  @abstractmethod
  def run(self, point: Optional[S_ProcessPoint], stack: EvalStack) -> AsyncIterator[ProcessEvent]:
    ...

  @staticmethod
  def duration(data: Any) -> DurationTerm:
    return DurationTerm.unknown()

  @staticmethod
  def import_point(data: Any, /):
    raise NotImplementedError

  @abstractstaticmethod
  def export_data(data: Any, /) -> Any:
    ...


class ProcessBlock(BaseBlock, Generic[T_ProcessData, S_ProcessPoint]):
  def __init__(self, data: Evaluable[PossiblyLocatedValue[T_ProcessData]], ProcessType: type[BaseProcess[T_ProcessData, S_ProcessPoint]], /):
    self._data = data
    self._ProcessType = ProcessType

  def duration(self):
    return self._ProcessType.duration(self._data)

  def create_program(self, handle):
    return ProcessProgram(self, handle)

  def import_point(self, data, /):
    return self._ProcessType.import_point(data)

  def export(self):
    return {
      "name": self._ProcessType.name,
      "namespace": self._ProcessType.namespace,

      "data": self._ProcessType.export_data(self._data),
      "duration": self.duration().export()
    }


class ProcessError(Exception):
  pass

class ProcessInternalError(ProcessError):
  def __init__(self, exception: Exception, /):
    self.exception = exception

class ProcessProtocolError(ProcessError):
  def __init__(self, message: str, /):
    self.message = message


@dataclass
class ProcessProgramMode:
  @dataclass
  class Broken():
    event: Event = field(default_factory=Event, repr=False)

    def export(self):
      return 0

  @dataclass
  class Halting():
    # event: Event = field(default_factory=Event)

    def export(self):
      return 1

  @dataclass
  class Normal():
    term: DatetimeTerm = field(default_factory=DatetimeTerm.unknown)

    def export(self):
      return 2

  @dataclass
  class Pausing:
    term: DatetimeTerm
    event: Event = field(default_factory=Event, repr=False)

    def export(self):
      return 3

  @dataclass
  class Paused():
    term: DurationTerm

    def export(self):
      return 4

  @dataclass
  class Resuming():
    event: Event = field(default_factory=Event, repr=False)

    def export(self):
      return 5

  @dataclass
  class Starting():
    def export(self):
      return 6

  @dataclass
  class Terminated():
    def export(self):
      return 7

  Any = Broken | Halting | Normal | Paused | Pausing | Resuming | Starting | Terminated


@dataclass(kw_only=True)
class ProcessProgramLocation:
  mode: int
  pausable: bool
  process: Optional[Exportable]
  time: float

  def export(self):
    return {
      "mode": self.mode,
      "pausable": self.pausable,
      "process": self.process and self.process.export(),
      "time": self.time * 1000
    }


@provide_logger(logger)
class ProcessProgram(HeadProgram):
  def __init__(self, block: ProcessBlock, handle):
    self._block = block
    self._handle = handle

    self._mode: ProcessProgramMode.Any
    self._point: Optional[Any]
    self._process: BaseProcess
    self._process_duration: DurationTerm # Optional[tuple[float, float]]
    self._process_location: Optional[Exportable]
    self._process_pausable: bool

  def halt(self):
    match self._mode:
      case ProcessProgramMode.Broken(event):
        event.set()
      case ProcessProgramMode.Normal() | ProcessProgramMode.Pausing() | ProcessProgramMode.Paused() | ProcessProgramMode.Resuming():
        self._process.halt()

    self._mode = ProcessProgramMode.Halting()

  def jump(self, point, /):
    if not self._process.jump(point):
      # Halt and restart the process if it could not be paused
      self._point = point
      self.halt()

  async def pause(self):
    match self._mode:
      case ProcessProgramMode.Normal():
        if not self._process_pausable:
          return False

        self._mode = ProcessProgramMode.Pausing(self._mode.term)

        self._handle.set_location(
          ProcessProgramLocation(
            mode=self._mode.export(),
            pausable=self._process_pausable,
            process=self._process_location,
            time=time.time()
          )
        )

        self._process.pause()

        await self._mode.event.wait()
        return True
      case ProcessProgramMode.Pausing(event=event):
        await event.wait()
        return True
      case _:
        return False

  async def resume(self):
    match self._mode:
      case ProcessProgramMode.Normal():
        return True
      case ProcessProgramMode.Paused():
        self._mode = ProcessProgramMode.Resuming()
        self._handle.send(ProgramExecEvent(
          location=ProcessProgramLocation(
            mode=self._mode.export(),
            pausable=self._process_pausable,
            process=self._process_location,
            time=time.time()
          )
        ))

        self._process.resume()

        await self._mode.event.wait()
        return True
      case ProcessProgramMode.Resuming(event):
        await event.wait()
        return True
      case _:
        return False

  def receive(self, message, /):
    match message["type"]:
      case "jump":
        self.jump(self._block.import_point(message["value"]))
      case "pause":
        self._handle.master.pool.start_soon(self.pause())
      case "resume":
        self._handle.master.pool.start_soon(self.resume())
      case _:
        return super().receive(message)

  def term_info(self, children_terms):
    match self._mode:
      case ProcessProgramMode.Normal() | ProcessProgramMode.Paused() | ProcessProgramMode.Pausing():
        return self._mode.term, dict()
      case _:
        return DatetimeTerm.unknown(), dict()

  async def run(self, point, stack):
    global ProcessProgramMode
    Mode = ProcessProgramMode

    analysis, data = self._block._data.evaluate_final(EvalContext(stack, cwd_path=self._handle.master.experiment.path))

    if isinstance(data, EllipsisType):
      self._mode = Mode.Broken()
      self._handle.send(ProgramExecEvent(
        analysis=RuntimeAnalysis(
          errors=analysis.errors,
          warnings=analysis.warnings
        ),
        location=ProcessProgramLocation(
          mode=self._mode.export(),
          pausable=False,
          process=None,
          time=time.time()
        )
      ))

      await self._mode.event.wait()

      del self._mode
      return

    initial_iteration = True
    self._point = point or None

    while self._point or initial_iteration:
      current_point = self._point
      initial_iteration = False

      self._mode = Mode.Starting()
      self._point = None
      self._process = self._block._ProcessType(data.dislocate(), master=self._handle.master)
      self._process_duration = DurationTerm.unknown()
      self._process_location = None
      self._process_pausable = False

      process_iter = self._process.run(current_point, stack)

      while True:
        analysis = RuntimeAnalysis()

        try:
          try:
            event = await anext(process_iter)
          except StopAsyncIteration:
            if not isinstance(self._mode, (Mode.Broken, Mode.Terminated)):
              raise ProcessProtocolError(f"Process returned without sending a {ProcessFailureEvent.__name__} or {ProcessTerminationEvent.__name__} event")

            break
          except Exception as e:
            raise ProcessInternalError(e) from e

          event_time = event.time or time.time()

          analysis += event.analysis
          self._process_location = event.location or self._process_location

          match (self._mode, event):
            case (Mode.Starting(), ProcessExecEvent()):
              if not self._process_location:
                raise ProcessProtocolError(f"Process sent a {ProcessExecEvent.__name__} event with a falsy location while starting")

              self._mode = Mode.Normal()

            case (Mode.Halting() | Mode.Normal(), ProcessExecEvent()):
              pass

            case (Mode.Resuming(resuming_event), ProcessExecEvent()):
                resuming_event.set()
                self._mode = Mode.Normal()

            case (
              Mode.Halting() | Mode.Normal() | Mode.Pausing() | Mode.Paused() | Mode.Resuming() | Mode.Starting(),
              ProcessFailureEvent()
            ):
              self._mode = Mode.Broken()

            case (Mode.Pausing(term, pausing_event), ProcessPauseEvent()):
              pausing_event.set()

              self._mode = Mode.Paused(
                DurationTerm(
                  (term.value - event_time),
                  term.resolution
                ) if term else DurationTerm.unknown()
              )

              self._handle.set_term()

            case (
              Mode.Halting() | Mode.Normal() | Mode.Paused() | Mode.Resuming() | Mode.Starting(),
              ProcessTerminationEvent()
            ):
              self._mode = Mode.Terminated()

            case _:
              raise ProcessProtocolError(f"Invalid event of type {event.__class__.__name__} event while in mode {self._mode.__class__.__name__}")

          if isinstance(event, ProcessExecEvent) and (event.pausable is not None):
            self._process_pausable = event.pausable

          # if isinstance(event, (ProcessExecEvent, ProcessPauseEvent)):
          #   print()
          #   print()
          #   print(self._mode, event.duration)
          #   print()
          #   print()

          if isinstance(self._mode, Mode.Normal) and isinstance(event, (ProcessExecEvent, ProcessPauseEvent)) and event.duration:
            self._mode.term = DatetimeTerm(event_time) + event.duration
            self._handle.set_term()

          if isinstance(self._mode, Mode.Paused) and isinstance(event, (ProcessExecEvent, ProcessPauseEvent)) and event.duration:
            self._mode.term = event.duration
            self._handle.set_term()

        except (ProcessInternalError, ProcessProtocolError) as e:
          logger.error(f"Process protocol error: {e}")
          log_exception(logger)

          if self._mode == Mode.Terminated:
            logger.error(f"This error cannot be reported to the user.")
            continue

          self._mode = Mode.Broken()

          match e:
            case ProcessInternalError():
              error = Diagnostic("Process internal error")
            case ProcessProtocolError():
              error = Diagnostic(e.message)
            case _:
              raise UnreachableError

          analysis.errors.append(error)

        self._handle.send(ProgramExecEvent(
          analysis=analysis,
          location=ProcessProgramLocation(
            mode=self._mode.export(),
            pausable=self._process_pausable,
            process=self._process_location,
            time=time.time()
          )
        ))

        if isinstance(self._mode, Mode.Broken):
          await self._mode.event.wait()

          # Cancel the jump request, if any
          self._point = None

          self._mode = Mode.Terminated()
          self._handle.send(ProgramExecEvent(
            location=ProcessProgramLocation(
              mode=self._mode.export(),
              pausable=self._process_pausable,
              process=self._process_location,
              time=time.time()
            )
          ))

          break

      del self._mode
      del self._process
      del self._process_location
      del self._process_pausable

    del self._point


__all__ = [
  'BaseProcess',
  'BaseProcessEvent',
  'BaseProcessPoint',
  'ProcessError',
  'ProcessExecEvent',
  'ProcessFailureEvent',
  'ProcessInternalError',
  'ProcessPauseEvent',
  'ProcessProgram',
  'ProcessProgramLocation',
  'ProcessProgramMode',
  'ProcessProtocolError',
  'ProcessTerminationEvent'
]

import datetime
from abc import ABC, abstractmethod
from asyncio import Event
from dataclasses import dataclass, field
import time
from typing import TYPE_CHECKING, Any, AsyncIterator, ClassVar, Generic, Optional, Self, TypeVar

from ..host import logger
from ..master.analysis import MasterAnalysis, MasterError
from ..util.decorators import provide_logger
from ..util.misc import Exportable, UnreachableError
from .eval import EvalStack
from .parser import BaseBlock, HeadProgram

if TYPE_CHECKING:
  from .master2 import Master


DateLike = datetime.datetime | float
DurationLike = datetime.timedelta | float

def transform_duration(value: DurationLike, /) -> float:
  return value.total_seconds() if isinstance(value, datetime.timedelta) else value

class ProgramExecDuration:
  def __init__(self, value: DurationLike, /, resolution: DurationLike = 0.0):
    self.resolution = resolution
    self.value = value

  def export(self):
    return {
      "resolution": transform_duration(self.resolution),
      "value": transform_duration(self.value)
    }


@dataclass(kw_only=True)
class ProgramExecEvent:
  analysis: MasterAnalysis = field(default_factory=MasterAnalysis)
  location: Optional[Exportable] = None
  time: Optional[float] = None


@dataclass(kw_only=True)
class BaseProcessEvent:
  analysis: MasterAnalysis = field(default_factory=MasterAnalysis)
  location: Optional[Exportable] = None
  time: Optional[float] = None

@dataclass(kw_only=True)
class ProcessExecEvent(BaseProcessEvent):
  duration: Optional[ProgramExecDuration | DurationLike] = None
  pausable: Optional[bool] = None

@dataclass(kw_only=True)
class ProcessPauseEvent(BaseProcessEvent):
  duration: Optional[ProgramExecDuration | DurationLike] = None

@dataclass(kw_only=True)
class ProcessFailureEvent(BaseProcessEvent):
  pass

@dataclass(kw_only=True)
class ProcessTerminationEvent(BaseProcessEvent):
  pass

ProcessEvent = ProcessExecEvent | ProcessFailureEvent | ProcessPauseEvent | ProcessTerminationEvent


class BaseProcessPoint(ABC):
  pass


S_ProcessPoint = TypeVar('S_ProcessPoint', bound=BaseProcessPoint)

class BaseProcessData(Exportable, ABC, Generic[S_ProcessPoint]):
  @abstractmethod
  def export(self) -> Any:
    ...

  @abstractmethod
  def import_point(self, data: Any, /) -> S_ProcessPoint:
    ...

T_ProcessData = TypeVar('T_ProcessData', bound=BaseProcessData)

class BaseProcess(ABC, Generic[T_ProcessData, S_ProcessPoint]):
  name: ClassVar[str]
  namespace: ClassVar[str]

  def __init__(self, data: T_ProcessData, /, master: 'Master'):
    ...

  def halt(self) -> Optional[bool]:
    return None

  def jump(self, point: S_ProcessPoint, /) -> bool:
    return False

  def pause(self):
    ...

  def resume(self):
    ...

  @abstractmethod
  def run(self, point: Optional[S_ProcessPoint], stack: EvalStack) -> AsyncIterator[ProcessEvent]:
    ...


class ProcessBlock(BaseBlock, Generic[T_ProcessData, S_ProcessPoint]):
  def __init__(self, data: T_ProcessData, ProcessType: type[BaseProcess[T_ProcessData, S_ProcessPoint]], /):
    self._data = data
    self._ProcessType = ProcessType

  def create_program(self, handle):
    return ProcessProgram(self, handle)

  def import_point(self, data, /):
    return self._data.import_point(data)

  def export(self):
    return {
      "name": self._ProcessType.name,
      "namespace": self._ProcessType.namespace,
      "data": self._data.export()
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
    def export(self):
      return 2

  @dataclass
  class Pausing:
    event: Event = field(default_factory=Event, repr=False)

    def export(self):
      return 3

  @dataclass
  class Paused():
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
  mode: ProcessProgramMode.Any
  pausable: bool
  process: Optional[Exportable]
  time: float

  def export(self):
    return {
      "mode": self.mode.export(),
      "pausable": self.pausable,
      "process": self.process and self.process.export(),
      "time": self.time * 1000.0
    }


@provide_logger(logger)
class ProcessProgram(HeadProgram):
  def __init__(self, block: ProcessBlock, handle):
    self._block = block
    self._handle = handle

    self._mode: ProcessProgramMode.Any
    self._point: Optional[Any]
    self._process: BaseProcess
    self._process_location: Optional[Exportable]
    self._process_pausable: bool

  def halt(self):
    self._process.halt()

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

        self._mode = ProcessProgramMode.Pausing()
        self._handle.send(ProgramExecEvent(
          location=ProcessProgramLocation(
            mode=self._mode,
            pausable=self._process_pausable,
            process=self._process_location,
            time=time.time()
          )
        ))

        self._process.pause()

        await self._mode.event.wait()
        return True
      case ProcessProgramMode.Pausing(event):
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
            mode=self._mode,
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

  async def run(self, point, stack):
    global ProcessProgramMode
    Mode = ProcessProgramMode

    initial_iteration = True
    self._point = point or None

    while self._point or initial_iteration:
      current_point = self._point
      initial_iteration = False

      self._mode = Mode.Starting()
      self._point = None
      self._process = self._block._ProcessType(self._block._data, master=self._handle.master)
      self._process_location = None
      self._process_pausable = False

      process_iter = self._process.run(current_point, stack)

      while True:
        analysis = MasterAnalysis()

        try:
          try:
            event = await anext(process_iter)
          except StopAsyncIteration:
            if not isinstance(self._mode, (Mode.Broken, Mode.Terminated)):
              raise ProcessProtocolError(f"Process returned without sending a {ProcessFailureEvent.__name__} or {ProcessTerminationEvent.__name__} event")

            break
          except Exception as e:
            raise ProcessInternalError(e) from e

          analysis += event.analysis
          self._process_location = event.location or self._process_location

          match (self._mode, event):
            case (Mode.Starting(), ProcessExecEvent()):
              if not self._process_location:
                raise ProcessProtocolError(f"Process sent a {ProcessExecEvent.__name__} event with a falsy location while starting")

              self._mode = Mode.Normal()

              # if pausable is not None:
              #   self._process_pausable = pausable

            case (Mode.Normal(), ProcessExecEvent()):
              pass

            case (Mode.Resuming(resuming_event), ProcessExecEvent()):
                resuming_event.set()
                self._mode = Mode.Normal()

            case (
              Mode.Halting() | Mode.Normal() | Mode.Pausing() | Mode.Paused() | Mode.Resuming() | Mode.Starting(),
              ProcessFailureEvent()
            ):
              self._mode = Mode.Broken()

            case (Mode.Pausing(pausing_event), ProcessPauseEvent()):
              pausing_event.set()
              self._mode = Mode.Paused()

            case (
              Mode.Halting() | Mode.Normal() | Mode.Paused() | Mode.Resuming() | Mode.Starting(),
              ProcessTerminationEvent()
            ):
              self._mode = Mode.Terminated()

            case _:
              raise ProcessProtocolError(f"Invalid event of type {event.__class__.__name__} event while in mode {self._mode.__class__.__name__}")

          if isinstance(event, ProcessExecEvent) and (event.pausable is not None):
            self._process_pausable = event.pausable
        except (ProcessInternalError, ProcessProtocolError) as e:
          logger.error(f"Process protocol error: {e}")

          if self._mode == Mode.Terminated:
            logger.error(f"This error cannot be reported to the user.")
            continue

          self._mode = Mode.Broken()

          match e:
            case ProcessInternalError():
              error = MasterError("Process internal error")
            case ProcessProtocolError():
              error = MasterError(e.message)
            case _:
              raise UnreachableError

          analysis.errors.append(error)

        self._handle.send(ProgramExecEvent(
          analysis=analysis,
          location=ProcessProgramLocation(
            mode=self._mode,
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
              mode=self._mode,
              pausable=self._process_pausable,
              process=self._process_location,
              time=time.time()
            )
          ))

      del self._mode
      del self._process
      del self._process_location
      del self._process_pausable

    del self._point

import asyncio
import functools
import logging
import time
from abc import ABC, abstractmethod
from asyncio import Event, Future, Task
from dataclasses import dataclass, field
from enum import Enum, auto
from logging import Logger
from types import EllipsisType
from typing import (Any, Awaitable, ClassVar, Generic, Optional, Protocol,
                    TypeVar, assert_never, cast, final)

import comserde

from . import logger
from .error import Diagnostic
from .eta import DurationTerm, Term
from .fiber.expr import Evaluable
from .fiber.parser import BaseBlock, BaseProgram, BaseProgramPoint
from .master.analysis import Effect, RuntimeAnalysis
from .plugin.manager import PluginName
from .reader import PossiblyLocatedValue
from .util.asyncio import race
from .util.decorators import provide_logger
from .util.misc import Exportable, UnreachableError, log_exception


class BaseProcessPoint(ABC):
  pass

T = TypeVar('T')
T_ProcessData = TypeVar('T_ProcessData')
T_ProcessLocation = TypeVar('T_ProcessLocation', bound=Exportable)
T_ProcessPoint = TypeVar('T_ProcessPoint', bound=BaseProcessPoint)

class ProcessBlock(BaseBlock, Generic[T_ProcessData, T_ProcessPoint]):
  def __init__(self, data: Evaluable[PossiblyLocatedValue[T_ProcessData]], process: 'BaseClassProcess', /):
    self._data = data
    self._process = process

  def duration(self):
    return self._process.duration(self._data)

  def create_program(self, handle):
    return ProcessProgram(self, handle)

  def import_point(self, data, /):
    return self._process.import_point(data)

  def export(self):
    return {
      "name": self._process.name,
      "namespace": self._process.namespace,

      "data": self._process.export_data(self._data),
      "duration": self.duration().export()
    }


@dataclass(frozen=True, slots=True)
class ProcessFailureError(Exception):
  message: Optional[str] = None


class ProcessException(Exception):
  pass

@dataclass(frozen=True, slots=True)
class ProcessJumpRequest(ProcessException, Generic[T_ProcessPoint]):
  point: T_ProcessPoint

class ProcessPauseRequest(ProcessException):
  pass

class ProcessSwapRequest(ProcessException):
  pass


class ProcessContext(Generic[T_ProcessData, T_ProcessLocation, T_ProcessPoint]):
  _instance_number: ClassVar[int] = 0

  def __init__(self, program: 'ProcessProgram', data: T_ProcessData):
    self._data = data
    self._program = program

  @property
  def _mode(self):
    assert isinstance(self._program._mode, ProcessProgramMode.Running)
    return self._program._mode

  @property
  def data(self):
    return self._data

  @functools.cached_property
  def logger(self):
    instance_number = self.__class__._instance_number
    self.__class__._instance_number += 1

    return logger.getChild(f"process{instance_number}")

  @property
  def pausable(self):
    return self._mode.pausable

  @pausable.setter
  def pausable(self, value: bool, /):
    assert isinstance(self._program._mode, ProcessProgramMode.Running)

    self._mode.pausable = value
    self._program._send_location()

  @property
  def point(self):
    return cast(Optional[T_ProcessPoint], self._program._point)

  def cast(self, value: ProcessJumpRequest, /) -> ProcessJumpRequest[T_ProcessPoint]:
    return value

  async def checkpoint(self):
    match self._mode.form:
      # case ProcessProgramForm.Paused():
      #   raise RuntimeError("Invalid call, calling checkpoint() while paused is invalid")
      case ProcessProgramForm.Pausing():
        self._mode.form = ProcessProgramForm.Paused()
        self._program._send_location()

        await self.wait(self._mode.form.event.wait())
      case _:
        self.test()

  def test(self):
    match self._mode.form:
      # case ProcessProgramForm.Halting():
      #   raise asyncio.CancelledError
      case ProcessProgramForm.Jumping(point):
        self._mode.form = ProcessProgramForm.Normal()
        raise ProcessJumpRequest(point)
      case ProcessProgramForm.Pausing():
        raise ProcessPauseRequest

  async def wait(self, awaitable: Awaitable[T], /) -> T:
    end_index, result = await race(
      awaitable,
      self._program._action_event.wait()
    )

    if end_index == 0:
      return result

    self._program._action_event.clear()
    self.test()

    raise UnreachableError

  def send_term(self, term: Term, /):
    self._mode.term = term
    self._program._handle.send_term()

  def send_effect(self, effect: Effect, /):
    self._program._handle.send_analysis(RuntimeAnalysis(effects=[effect]))

  def send_error(self, error: Diagnostic, /):
    self._program._handle.send_analysis(RuntimeAnalysis(errors=[error]))

  def send_warning(self, warning: Diagnostic, /):
    self._program._handle.send_analysis(RuntimeAnalysis(warnings=[warning]))

  def send_location(self, location: T_ProcessLocation, /):
    self._mode.process_location = location
    self._program._send_location()


class FunctionProcessProtocol(Protocol[T_ProcessData, T_ProcessLocation, T_ProcessPoint]):
  async def __call__(self, context: ProcessContext[T_ProcessData, T_ProcessLocation, T_ProcessPoint]) -> None:
    ...

class BaseClassProcess(ABC, Generic[T_ProcessData, T_ProcessLocation, T_ProcessPoint]):
  name: str
  namespace: PluginName

  def duration(self, data: T_ProcessData) -> DurationTerm:
    raise NotImplementedError

  def import_point(self, raw_point: Any, /) -> T_ProcessPoint:
    raise NotImplementedError

  def export_data(self, data: T_ProcessData) -> Any:
    ...

  @abstractmethod
  async def __call__(self, context: ProcessContext[T_ProcessData, T_ProcessLocation, T_ProcessPoint]) -> None:
    ...

ProcessProtocol = FunctionProcessProtocol[T_ProcessData, T_ProcessLocation, T_ProcessPoint] | BaseClassProcess[T_ProcessData, T_ProcessLocation, T_ProcessPoint]


@comserde.serializable
class ProcessProgramFormLocation(Enum):
  Halting = auto()
  Jumping = auto()
  Normal = auto()
  Paused = auto()
  Pausing = auto()

  def export(self):
    match self:
      case ProcessProgramFormLocation.Halting:
        return "halting"
      case ProcessProgramFormLocation.Jumping:
        return "jumping"
      case ProcessProgramFormLocation.Normal:
        return "normal"
      case ProcessProgramFormLocation.Paused:
        return "paused"
      case ProcessProgramFormLocation.Pausing:
        return "pausing"

class ProcessProgramForm:
  class Base:
    location: ClassVar[ProcessProgramFormLocation]

  @dataclass(frozen=True, slots=True)
  class Halting(Base):
    location = ProcessProgramFormLocation.Halting

  @dataclass(frozen=True, slots=True)
  class Jumping(Base):
    location = ProcessProgramFormLocation.Jumping
    point: Any

  @dataclass(frozen=True, slots=True)
  class Normal(Base):
    location = ProcessProgramFormLocation.Normal

  @dataclass(frozen=True, slots=True)
  class Paused(Base):
    location = ProcessProgramFormLocation.Paused
    event: Event = field(default_factory=Event, init=False, repr=False)

  @dataclass(frozen=True, slots=True)
  class Pausing(Base):
    location = ProcessProgramFormLocation.Pausing

  Any = Halting | Jumping | Normal | Paused | Pausing


class ProcessProgramMode:
  @dataclass(frozen=True, slots=True)
  class CollectionFailed:
    retry_future: Future[bool] = field(default_factory=Future, init=False, repr=False)

    def location(self):
      return ProcessProgramMode.CollectionFailedLocation()

  @comserde.serializable
  @dataclass(frozen=True, slots=True)
  class CollectionFailedLocation:
    def export(self):
      return { "type": "collectionFailed" }

  @dataclass(frozen=True, slots=True)
  class Collecting:
    task: Task[object] = field(repr=False)

    def location(self):
      return ProcessProgramMode.CollectingLocation()

    def export(self):
      return { "type": "collecting" }

  @comserde.serializable
  @dataclass(frozen=True, slots=True)
  class CollectingLocation:
    def export(self):
      return { "type": "collecting" }

  @dataclass(frozen=True, slots=True)
  class Failed:
    error_id: int
    retry_future: Future[bool] = field(default_factory=Future, init=False, repr=False)

    def location(self):
      return ProcessProgramMode.FailedLocation(self.error_id)

  @comserde.serializable
  @dataclass(frozen=True, slots=True)
  class FailedLocation:
    error_id: int

    def export(self):
      return {
        "type": "failed",
        "errorId": self.error_id
      }

  @dataclass(frozen=True, slots=True)
  class Halting:
    def location(self):
      return ProcessProgramMode.HaltingLocation()

  @comserde.serializable
  @dataclass(frozen=True, slots=True)
  class HaltingLocation:
    def export(self):
      return { "type": "halting" }

  @dataclass(slots=True)
  class Running:
    form: ProcessProgramForm.Any
    process_location: Optional[Exportable]
    pausable: bool
    task: Task[None] = field(repr=False)
    term: Term

    def location(self):
      return ProcessProgramMode.RunningLocation(
        form=self.form.location,
        process_location=self.process_location,
        pausable=self.pausable
      )

  @comserde.serializable
  @dataclass(frozen=True, slots=True)
  class RunningLocation:
    form: ProcessProgramFormLocation
    process_location: Optional[Exportable]
    pausable: bool

    def export(self):
      return {
        "type": "running",
        "form": self.form.export(),
        "processLocation": self.process_location and self.process_location.export(),
        "pausable": self.pausable
      }

  Any = CollectionFailed | Collecting | Failed | Halting | Running
  AnyLocation = CollectionFailedLocation | CollectingLocation | FailedLocation | HaltingLocation | RunningLocation


@comserde.serializable
@dataclass
class ProcessProgramLocation:
  mode: ProcessProgramMode.AnyLocation

  def export(self):
    return {
      "date": time.time() * 1000,
      "mode": self.mode.export()
    }


@dataclass
class ProcessProgramPoint(BaseProgramPoint):
  process_point: BaseProcessPoint

@final
@provide_logger(logger)
class ProcessProgram(BaseProgram):
  def __init__(self, block: ProcessBlock, handle):
    self._block = block
    self._handle = handle

    self._action_event = Event()
    self._mode: ProcessProgramMode.Any
    self._point: Optional[BaseProcessPoint]

    self._logger: Logger

  def jump(self, point, /):
    match self._mode:
      case ProcessProgramMode.Running(form=ProcessProgramForm.Normal()):
        self._mode.form = ProcessProgramForm.Jumping(point)
        self._action_event.set()

        return True

      case _:
        return False

  def halt(self):
    match self._mode:
      case ProcessProgramMode.CollectionFailed(retry_future=fut) | ProcessProgramMode.Failed(retry_future=fut):
        fut.set_result(False)
        self._mode = ProcessProgramMode.Halting()

      case ProcessProgramMode.Collecting(task):
        task.cancel()
        self._mode = ProcessProgramMode.Halting()

      case ProcessProgramMode.Halting():
        pass

      case ProcessProgramMode.Running(form=ProcessProgramForm.Halting(), task=task):
        self._logger.warning("Halting program again")
        task.cancel()

      case ProcessProgramMode.Running(task=task):
        task.cancel()

      case _:
        assert_never(self._mode)

  def _pause(self):
    match self._mode:
      case ProcessProgramMode.Running(form=ProcessProgramForm.Normal(), pausable=True):
        self._mode.form = ProcessProgramForm.Pausing()
        self._send_location()
        self._action_event.set()

        return True

      case ProcessProgramMode.Running(form=ProcessProgramForm.Pausing()):
        return True

      case _:
        return False

  def _resume(self):
    match self._mode:
      case ProcessProgramMode.Running(form=ProcessProgramForm.Paused(event=event)):
        event.set()

        self._mode.form = ProcessProgramForm.Normal()
        self._send_location()

        return True

      case _:
        return False

  def receive(self, message, /):
    match message["type"]:
      case "jump":
        self.jump(self._block.import_point(message["value"]))
      case "pause":
        self._pause()
      case "resume":
        self._resume()
      case _:
        return super().receive(message)

  def term_info(self, children_terms):
    match self._mode:
      case ProcessProgramMode.Collecting():
        return self._block.duration(), {}
      case ProcessProgramMode.Running(term=term):
        return term, {}
      case _:
        return DurationTerm.zero(), {}

  # async def swap(self, block):
  #   self._action_future.set_exception(SwapRequest(block._data))
  #   self._action_future = Future()

  def _send_location(self):
    self._handle.send_location(ProcessProgramLocation(self._mode.location()))

  async def run(self, point: Optional[ProcessProgramPoint], stack):
    self._point = point and point.process_point

    while True:
      task = asyncio.create_task(self._block._data.evaluate_final_async(self._handle.context))

      self._mode = ProcessProgramMode.Collecting(task)
      self._send_location()

      try:
        analysis, data = await task
      except asyncio.CancelledError:
        return

      self._handle.send_analysis(analysis)

      if isinstance(data, EllipsisType):
        self._mode = ProcessProgramMode.CollectionFailed()
        self._send_location()

        if not await self._mode.retry_future:
          return
      else:
        break


    while True:
      self._context = ProcessContext(self, data.dislocate())

      self._mode = ProcessProgramMode.Running(
        form=ProcessProgramForm.Normal(),
        process_location=None,
        pausable=False,
        task=asyncio.create_task(self._block._process(self._context)),
        term=DurationTerm.unknown()
      )
      self._send_location()

      try:
        await self._mode.task
      except asyncio.CancelledError:
        break
      except ProcessJumpRequest as e:
        self._logger.warning("Failed to jump, restarting process")
        self._point = e.point
      except ProcessFailureError as e:
        error_id = self._handle.master.allocate_analysis_item_id()
        error = Diagnostic(repr(e.__cause__) if e.__cause__ else "Unknown error", id=error_id)

        self._mode = ProcessProgramMode.Failed(error_id)
        self._handle.send_analysis(RuntimeAnalysis(errors=[error]))
        self._handle.send_term()
        self._send_location()

        if not await self._mode.retry_future:
          break
      except Exception as e:
        log_exception(self._logger, level=logging.ERROR)

        error_id = self._handle.master.allocate_analysis_item_id()
        error = Diagnostic(f"Process internal error: {e!r}", id=error_id)

        self._mode = ProcessProgramMode.Failed(error_id)
        self._handle.send_analysis(RuntimeAnalysis(errors=[error]))
        self._handle.send_term()
        self._send_location()

        if not await self._mode.retry_future:
          break
      else:
        break


__all__ = [
  'BaseClassProcess',
  'BaseProcessPoint',
  'ProcessContext',
  'ProcessException',
  'ProcessFailureError',
  'ProcessJumpRequest',
  'ProcessPauseRequest',
  'ProcessProgram',
  'ProcessProgramForm',
  'ProcessProgramMode',
  'ProcessSwapRequest'
]

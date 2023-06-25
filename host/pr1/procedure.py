import asyncio
from logging import Logger
from asyncio import Event, Future, Task
from dataclasses import dataclass, field
import logging
from types import EllipsisType
from typing import Any, Awaitable, Coroutine, Generator, Generic, Optional, Protocol, TypeVar, assert_never, cast, final
from uuid import uuid4

from pr1.eta import Term

from .eta import DurationTerm, Term

from .master.analysis import Effect, RuntimeAnalysis

from . import logger
from .util.decorators import provide_logger
from .analysis import DiagnosticAnalysis
from .error import Diagnostic
from .util.asyncio import cancel_task, race
from .fiber.eval import EvalContext
from .util.misc import Exportable, UnreachableError, log_exception
from .fiber.process import BaseProcessPoint, ProcessBlock, ProgramExecEvent
from .fiber.parser import BaseProgram, BaseProgramPoint


T = TypeVar('T')
T_ProcessData = TypeVar('T_ProcessData')
T_ProcessLocation = TypeVar('T_ProcessLocation', bound=Exportable)
T_ProcessPoint = TypeVar('T_ProcessPoint', bound=BaseProcessPoint)


@dataclass(frozen=True, slots=True)
class ProcessFailureError(Exception):
  message: Optional[str] = None

class ProcessException(Exception):
  pass


@dataclass(frozen=True, slots=True)
class JumpRequest(Exception, Generic[T_ProcessPoint]):
  point: T_ProcessPoint

class PauseRequest(ProcessException):
  pass

class SwapRequest(ProcessException):
  pass


class ProcessContext(Generic[T_ProcessData, T_ProcessLocation, T_ProcessPoint]):
  def __init__(self, program: 'ProcessProgram'):
    self._program = program

  @property
  def _mode(self):
    assert isinstance(self._program._mode, ProcessProgramMode.Running)
    return self._program._mode

  @property
  def data(self):
    return cast(T_ProcessData, self._program._block._data)

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

  async def checkpoint(self):
    match self._mode.form:
      # case ProcessProgramForm.Paused():
      #   raise RuntimeError("Invalid call, calling checkpoint() while paused is invalid")
      case ProcessProgramForm.Pausing():
        self._mode.form = ProcessProgramForm.Paused()
        await self.wait(self._mode.form.event.wait())
      case _:
        self.test()

  def test(self):
    match self._mode.form:
      case ProcessProgramForm.Jumping(point):
        raise JumpRequest(point)
      case ProcessProgramForm.Pausing():
        raise PauseRequest

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
    self._mode.location = location
    self._program._send_location()



class ProcessProtocol(Protocol):
  async def __call__(self, data, context: ProcessContext) -> None:
    ...



class ProcessProgramForm:
  class Halting:
    pass

  @dataclass
  class Jumping:
    point: Any

  class Normal:
    pass

  @dataclass(frozen=True, slots=True)
  class Paused:
    event: Event = field(default_factory=Event, init=False, repr=False)

  class Pausing:
    pass

  class Starting:
    pass

  Any = __import__('typing').Any # Halting | Normal | Paused | Pausing | Starting


class ProcessProgramMode:
  @dataclass
  class CollectionFailed:
    retry_future: Future[bool] = field(default_factory=Future, init=False, repr=False)

  @dataclass
  class Collecting:
    task: Task[object] = field(repr=False)

    def export(self):
      return {
        "type": "collecting"
      }

  @dataclass
  class Failed:
    diagnostic_id: int
    retry_future: Future[bool] = field(default_factory=Future, init=False, repr=False)

  @dataclass
  class Halting:
    pass

  @dataclass
  class Running:
    form: ProcessProgramForm.Any
    location: Optional[Exportable]
    pausable: bool
    task: Task[None] = field(repr=False)
    term: Term

    def export(self):
      return {
        "type": "running",
        "form": self.form,
        "pausable": self.pausable
      }

  Any = CollectionFailed | Collecting | Failed | Halting | Running


@dataclass
class ProcessProgramLocation:
  mode: ProcessProgramMode.Any

  def export(self):
    return {}


@dataclass
class ProcessProgramPoint(BaseProgramPoint):
  process_point: BaseProcessPoint

@final
@provide_logger(logger)
class ProcessProgram(BaseProgram):
  def __init__(self, block: ProcessBlock, handle):
    self._block = block
    self._handle = handle
    self._process: ProcessProtocol

    self._action_event: Event
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

  def pause(self):
    match self._mode:
      case ProcessProgramMode.Running(form=ProcessProgramForm.Normal(), pausable=True):
        self._mode.form = ProcessProgramForm.Pausing()
        self._send_location()
        self._action_future.set_exception(PauseRequest)

        return True

      case ProcessProgramMode.Running(form=ProcessProgramForm.Pausing()):
        return True

      case _:
        return False

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
    self._handle.send_location(ProcessProgramLocation(
      mode=self._mode
    ))

  async def run(self, point: ProcessProgramPoint, stack):
    self._point = point.process_point

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
      self._action_future = Future()
      self._context = ProcessContext(self)

      self._mode = ProcessProgramMode.Running(
        form=ProcessProgramForm.Normal(),
        location=None,
        pausable=False,
        task=asyncio.create_task(self._process(data, self._context)),
        term=DurationTerm.unknown()
      )
      self._send_location()

      try:
        await self._mode.task
      except asyncio.CancelledError:
        break
      except JumpRequest[T_ProcessPoint] as e:
        self._logger.warning("Failed to jump, restarting process")
        self._point = e.point
      except ProcessFailureError as e:
        error_id = self._handle.master.allocate_analysis_item_id()
        error = Diagnostic(repr(e.__cause__) if e.__cause__ else "Unknown error", id=error_id)

        self._mode = ProcessProgramMode.Failed(error_id)
        self._handle.send_analysis(RuntimeAnalysis(errors=[error]))
        self._handle.send_term()

        if not await self._mode.retry_future:
          break
      except Exception as e:
        log_exception(self._logger, level=logging.ERROR)

        error_id = self._handle.master.allocate_analysis_item_id()
        error = Diagnostic("Process internal error: {e!r}", id=error_id)

        self._mode = ProcessProgramMode.Failed(error_id)
        self._handle.send_analysis(RuntimeAnalysis(errors=[error]))
        self._handle.send_term()

        if not await self._mode.retry_future:
          break
      else:
        break


__all__ = [
  'JumpRequest',
  'PauseRequest',
  'ProcessContext',
  'ProcessException',
  'ProcessProgram',
  'ProcessProgramForm',
  'ProcessProgramMode',
  'ProcessProtocol',
  'SwapRequest'
]

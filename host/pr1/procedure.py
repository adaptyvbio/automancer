import asyncio
from logging import Logger
from asyncio import Event, Future
from dataclasses import dataclass, field
import logging
from types import EllipsisType
from typing import Any, Awaitable, Coroutine, Generator, Generic, Optional, Protocol, TypeVar, final
from uuid import uuid4

from .master.analysis import Effect, RuntimeAnalysis

from . import logger
from .util.decorators import provide_logger
from .analysis import DiagnosticAnalysis
from .error import Diagnostic
from .util.asyncio import cancel_task, race
from .fiber.eval import EvalContext
from .util.misc import Exportable, UnreachableError, log_exception
from .fiber.process import ProcessBlock, ProgramExecEvent
from .fiber.parser import BaseProgram


T = TypeVar('T')
T_Exportable = TypeVar('T_Exportable', bound=Exportable)


@dataclass(frozen=True, slots=True)
class ProcessFailureError(Exception):
  message: Optional[str] = None

class ProcessException(Exception):
  pass


@dataclass(frozen=True, slots=True)
class JumpRequest(Exception):
  point: Any

class PauseRequest(ProcessException):
  pass

class SwapRequest(ProcessException):
  pass


class ProcessContext(Generic[T_Exportable]):
  def __init__(self, program: 'ProcessProgram'):
    self._program = program

  async def checkpoint(self):
    match self._program._form:
      case ProcessProgramForm.Paused():
        raise RuntimeError("Invalid call, calling checkpoint() while paused is invalid")
      case ProcessProgramForm.Pausing():
        self._program._form = ProcessProgramForm.Paused()
        await self.wait(self._program._form.event.wait())

  def test(self):
    match self._program._form:
      case ProcessProgramForm.Jumping(point):
        raise JumpRequest(point)
      case ProcessProgramForm.Pausing():
        raise PauseRequest

  async def wait(self, coro: Coroutine[Any, Any, T]) -> T:
    end_index, result = await race(
      coro,
      asyncio.shield(self._program._action_future)
    )

    assert end_index == 0
    return result

    # task = asyncio.create_task(coro)

    # # Keep a reference to the action future as it might change after completion
    # action_future = self._program._action_future

    # try:
    #   await asyncio.wait([
    #     action_future,
    #     task
    #   ], return_when=asyncio.FIRST_COMPLETED)
    # except asyncio.CancelledError:
    #   await cancel_task(task)
    #   raise

    # if task.done():
    #   return await task

    # await cancel_task(task)

    # assert (exc := action_future.exception()) is not None
    # raise exc

  def send_effect(self, effect: Effect, /):
    self._program._handle.set_analysis(RuntimeAnalysis(effects=[effect]))

  def send_error(self, error: Diagnostic, /):
    self._program._handle.set_analysis(RuntimeAnalysis(errors=[error]))

  def send_warning(self, warning: Diagnostic, /):
    self._program._handle.set_analysis(RuntimeAnalysis(warnings=[warning]))

  def send_location(self, location: T_Exportable, /):
    self._program._handle.send(ProgramExecEvent(location=location))



class ProcessProtocol(Protocol):
  async def __call__(self, data, context: ProcessContext) -> None:
    ...



class ProcessProgramForm:
  @dataclass
  class CollectionFailed:
    retry_future: Future[bool] = field(default_factory=Future, init=False, repr=False)

  class Collecting:
    pass

  @dataclass
  class Failed:
    diagnostic_id: int
    retry_future: Future[bool] = field(default_factory=Future, init=False, repr=False)

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


@final
@provide_logger(logger)
class ProcessProgram(BaseProgram):
  def __init__(self, block: ProcessBlock, handle):
    self._block = block
    self._handle = handle
    self._process: ProcessProtocol

    self._action_future: Future[None]
    self._form: ProcessProgramForm.Any

    self._logger: Logger

  def jump(self, point):
    self._form = ProcessProgramForm.Jumping(point)
    self._action_future.set_exception(JumpRequest(point))

  def halt(self):
    match self._form:
      case ProcessProgramForm.Halting():
        pass

      case _:
        self._form = ProcessProgramForm.Halting()
        self._process_task.cancel()

  def pause(self):
    match self._form:
      case ProcessProgramForm.Normal():
        self._form = ProcessProgramForm.Pausing()
        self._action_future.set_exception(PauseRequest)

        return True

      case ProcessProgramForm.Pausing():
        return True

  # async def swap(self, block):
  #   self._action_future.set_exception(SwapRequest(block._data))
  #   self._action_future = Future()

  async def run(self, point, stack):
    while True:
      self._form = ProcessProgramForm.Collecting()

      analysis, data = await self._block._data.evaluate_final_async(self._handle.context)

      self._handle.set_analysis(analysis)

      if isinstance(data, EllipsisType):
        self._form = ProcessProgramForm.CollectionFailed()

        if not await self._form.retry_future:
          return
      else:
        break


    while True:
      self._action_future = Future()
      self._context = ProcessContext(self)

      self._process_task = asyncio.create_task(self._process(data, self._context))

      try:
        await self._process_task
      except asyncio.CancelledError:
        pass
      # except ProcessFailureError as e:
      #   error = Diagnostic(repr(e.__cause__) if e.__cause__ else "Unknown error", id=error_id)
      except Exception as e:
        log_exception(self._logger, level=logging.ERROR)

        error_id = self._handle.master.allocate_analysis_item_id()
        error = Diagnostic(repr(e), id=error_id)
        self._handle.set_analysis(RuntimeAnalysis(errors=[error]))
        self._form = ProcessProgramForm.Failed(error_id)

        if not await self._form.retry_future:
          break
      else:
        break

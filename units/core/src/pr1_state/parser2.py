from asyncio import Event, Task
import asyncio
from dataclasses import dataclass
from logging import Logger
from types import EllipsisType
from typing import Optional

from pr1.fiber.eval import EvalStack
from pr1.fiber.master2 import ProgramOwner
from pr1.fiber.parser import HeadProgram
from pr1.util.decorators import provide_logger

from . import logger
from .parser import StateApplierBlock, StateProgramPoint


@dataclass
class AbortedStateMode:
  pass

@dataclass
class ApplyingInitialStateMode:
  task: Task[bool]

@dataclass
class ApplyingRegularStateMode:
  task: Task[bool]

@dataclass
class HaltingApplyingInitialStateMode:
  pass

@dataclass
class HaltingApplyingRegularStateMode:
  pass

@dataclass
class HaltingSuspendingInitialStateMode:
  pass

@dataclass
class HaltingSuspendingRegularStateMode:
  pass

@dataclass
class NormalMode:
  pass

@dataclass
class PausingApplyingInitialStateMode:
  pass

@dataclass
class PausingChildMode:
  pass

@dataclass
class PausingSuspendingInitialStateMode:
  pass

@dataclass
class PausingSuspendingRegularStateMode:
  pass

@dataclass
class PausedMode:
  pass

@dataclass
class PausedUnappliedMode:
  pass

@dataclass
class TerminatedMode:
  pass


@provide_logger(logger)
class StateProgram(HeadProgram):
  def __init__(self, block: StateApplierBlock, handle):
    self._logger: Logger

    self._block = block
    self._handle = handle

    self._child_program: Optional[ProgramOwner] = None
    self._done_event = Event()
    self._stack: EvalStack

  @property
  def _state_manager(self):
    return self._handle.master.state_manager

  def halt(self):
    match self._mode:
      case AbortedStateMode():
        self._terminate()
      case ApplyingInitialStateMode(task):
        task.cancel()
        self._mode = HaltingApplyingInitialStateMode()
      case ApplyingRegularStateMode(task):
        task.cancel()
        self._mode = HaltingApplyingRegularStateMode()
      case NormalMode():
        self._mode = HaltingSuspendingRegularStateMode()
      case PausedMode():
        assert self._child_program
        self._child_program.halt()

  def pause(self):
    match self._mode:
      case ApplyingInitialStateMode(task):
        task.cancel()
        self._mode = PausingApplyingInitialStateMode()
      case NormalMode():
        asyncio.create_task(self._handle.pause_children()).add_done_callback(self._child_paused)
        self._mode = PausingChildMode()

  def resume(self):
    match self._mode:
      case PausedMode():
        self._mode = ApplyingRegularStateMode(self._apply_state())
      case PausedUnappliedMode():
        self._mode = ApplyingInitialStateMode(self._apply_state())

  async def run(self, stack):
    self._stack = stack

    analysis, result = self._state_manager.add(self._handle, self._block.state, stack=stack, update=self._update)

    if isinstance(result, EllipsisType):
      self._mode = AbortedStateMode()
    else:
      self._mode = ApplyingInitialStateMode(self._apply_state())

    await self._done_event.wait()
    await self._state_manager.remove(self._handle)

    self._mode = TerminatedMode()

  def _applied_state(self, task: Task[bool]):
    try:
      failure = task.done()
    except asyncio.CancelledError:
      # The block is being skipped or paused.

      match self._mode:
        case HaltingApplyingInitialStateMode():
          self._suspend_state()
          self._mode = HaltingSuspendingInitialStateMode()
        case HaltingApplyingRegularStateMode():
          self._suspend_state()
          self._mode = HaltingSuspendingRegularStateMode()
        case PausingApplyingInitialStateMode():
          self._suspend_state()
          self._mode = PausingSuspendingInitialStateMode()
    else:
      if failure:
        match self._mode:
          case ApplyingInitialStateMode():
            self._suspend_state()
            self._mode = PausingSuspendingInitialStateMode()
            self._handle.pause_unstable_parent()
          case ApplyingRegularStateMode():
            self._suspend_state()
            self._mode = PausingSuspendingRegularStateMode()
            self._handle.pause_unstable_parent()
      else:
        match self._mode:
          case ApplyingInitialStateMode():
            self._child_program = self._handle.create_child(self._block.child)
            asyncio.create_task(self._child_program.run(self._stack)).add_done_callback(self._child_returned)
            self._mode = NormalMode()
          case ApplyingRegularStateMode():
            self._mode = NormalMode()

  def _child_returned(self, task: Task[None]):
    task.done()

    self._child_program = None

    match self._mode:
      case ApplyingRegularStateMode(other_task):
        other_task.cancel()
        self._mode = HaltingApplyingRegularStateMode()
      case NormalMode():
        self._suspend_state()
        self._mode = HaltingSuspendingRegularStateMode()
      case PausedMode():
        self._terminate()
      case PausingSuspendingRegularStateMode():
        pass # Nothing to do

  def _suspended_state(self, task: Task[None]):
    task.done()

    match self._mode:
      case HaltingSuspendingInitialStateMode():
        self._terminate()
      case HaltingSuspendingRegularStateMode():
        self._terminate()
      case PausingSuspendingInitialStateMode():
        self._mode = PausedUnappliedMode()
      case PausingSuspendingRegularStateMode() if self._child_program:
        self._mode = PausedMode()
      case PausingSuspendingRegularStateMode():
        self._terminate()

  def _apply_state(self):
    task = asyncio.create_task(self._state_manager.apply(self._handle))
    task.add_done_callback(self._applied_state)

    return task

  def _child_paused(self, task: Task[None]):
    task.done()

    self._suspend_state()
    self._mode = PausingSuspendingRegularStateMode()

  def _suspend_state(self, *, clear: bool = False):
    async def func():
      await self._state_manager.suspend(self._handle)

      if clear:
        await self._state_manager.clear(self._handle)

    asyncio.create_task(func()).add_done_callback(self._suspended_state)

  def _terminate(self):
    self._done_event.set()

import asyncio
from asyncio import Future, Task
from dataclasses import dataclass
import time
from types import EllipsisType
from typing import Any, Optional

from pr1.fiber.eval import EvalContext
from pr1.fiber.expr import export_value
from pr1.fiber.process import BaseProcess, BaseProcessPoint, ProcessExecEvent, ProcessFailureEvent, ProcessPauseEvent, ProcessTerminationEvent
from pr1.master.analysis import MasterAnalysis
from pr1.ureg import ureg

from . import namespace
from .parser import ProcessData


@dataclass(kw_only=True)
class ProcessLocation:
  duration: Optional[float] # in seconds, none = wait forever
  progress: float
  paused: bool = False

  def export(self):
    return {
      "duration": {
        "quantity": export_value(self.duration * ureg.second),
        "value": (self.duration * 1000),
      } if self.duration is not None else None,
      "paused": self.paused,
      "progress": self.progress
    }

@dataclass
class ProcessPoint(BaseProcessPoint):
  progress: float

  @classmethod
  def import_value(cls, value: Any, /):
    return cls(progress=value["progress"])

class Process(BaseProcess[ProcessData, ProcessPoint]):
  name = "_"
  namespace = namespace

  def __init__(self, data: ProcessData, /):
    self._data = data

    self._progress: Optional[float] = None
    self._resume_future: Optional[Future] = None
    self._task: Optional[Task] = None

  def halt(self):
    if self._task:
      self._task.cancel()
    if self._resume_future:
      self._resume_future.cancel()
      self._resume_future = None

  def jump(self, point, /):
    self._progress = point.progress

    if self._task:
      self._task.cancel()

  def pause(self):
    assert self._task

    self._resume_future = Future()
    self._task.cancel()

  def resume(self):
    assert self._resume_future

    self._resume_future.set_result(None)
    self._resume_future = None

  async def run(self, point, stack):
    eval_analysis, eval_result = self._data.duration.eval(EvalContext(stack), final=True)

    if isinstance(eval_result, EllipsisType):
      yield ProcessFailureEvent(analysis=MasterAnalysis.cast(eval_analysis))
      return

    total_duration = eval_result.value.m_as('sec') if (eval_result.value != 'forever') else None
    self._progress = (point.progress if point else 0.0)

    initial = True

    while True:
      progress = self._progress
      self._progress = None

      remaining_duration = (total_duration * (1.0 - progress)) if (total_duration is not None) else None
      task_time = time.time()

      yield ProcessExecEvent(
        analysis=(MasterAnalysis.cast(eval_analysis) if initial else MasterAnalysis()),
        duration=remaining_duration,
        location=ProcessLocation(duration=total_duration, progress=progress),
        pausable=True,
        time=task_time
      )

      initial = False

      async def wait_forever():
        await Future()

      self._task = asyncio.create_task(
        asyncio.sleep(remaining_duration)
          if (remaining_duration is not None)
          else wait_forever()
      )

      try:
        await self._task
      except asyncio.CancelledError:
        if self._progress is None:
          self._task = None

          current_time = time.time()
          elapsed_time = current_time - task_time

          if total_duration is not None:
            progress += elapsed_time / total_duration
            remaining_duration = total_duration * (1.0 - progress)

          self._progress = progress

          # yield ProcessExecEvent(location=ProcessLocation(self._progress, paused=True))
          # await asyncio.sleep(2)

          location = ProcessLocation(
            duration=total_duration,
            paused=True,
            progress=progress
          )

          if self._resume_future:
            # The process is paused.
            yield ProcessPauseEvent(
              duration=remaining_duration,
              location=location,
              time=current_time
            )

            try:
              await self._resume_future
            except asyncio.CancelledError:
              # The process is halting while being paused.

              yield ProcessTerminationEvent(
                location=location,
                time=current_time
              )

              return

          else:
            # The process is halted.
            yield ProcessTerminationEvent(
              location=location,
              time=current_time
            )

            return
      else:
        break
      finally:
        self._task = None

    yield ProcessTerminationEvent(
      location=ProcessLocation(duration=total_duration, progress=1.0)
    )

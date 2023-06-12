import asyncio
import math
import time
from asyncio import Event, Future, Task
from dataclasses import dataclass, field
from typing import Any, Callable, Literal, Optional, TypeVar

import pr1 as am
from pr1.fiber.expr import (Evaluable, EvaluableConstantValue,
                            EvaluablePythonExpr)
from pr1.reader import LocatedValue, PossiblyLocatedValue
from quantops import Quantity

from . import namespace


ProcessData = Quantity | Literal['forever']

@dataclass(kw_only=True)
class ProcessLocation:
  duration: Optional[float] # in seconds, None = wait forever
  progress: float
  paused: bool = False

  def export(self):
    return {
      "duration": self.duration,
      "paused": self.paused,
      "progress": self.progress
    }


@dataclass
class ProcessPoint(am.BaseProcessPoint):
  progress: float


class ProcessMode:
  @dataclass
  class Halted:
    pass

  @dataclass
  class Normal:
    task: Task[None]

  @dataclass
  class Paused:
    event: Event = field(default_factory=Event, repr=False)

  @dataclass
  class WaitingForever:
    event: Event = field(default_factory=Event, repr=False)

  Any = Halted | Normal | Paused | WaitingForever


class Process(am.BaseProcess[ProcessData, ProcessPoint]):
  name = "_"
  namespace = namespace

  Point = ProcessPoint

  def __init__(self, data: ProcessData, /, master):
    self._data = data

    self._jump_progress: Optional[float] = None
    self._mode: ProcessMode.Any

  def halt(self):
    match self._mode:
      case ProcessMode.Normal(task):
        task.cancel()
      case ProcessMode.Paused(event):
        event.set()
      case ProcessMode.WaitingForever(event):
        event.set()

    self._mode = ProcessMode.Halted()

  def jump(self, point: ProcessPoint, /):
    self._jump_progress = point.progress

    match self._mode:
      case ProcessMode.Normal(task):
        task.cancel()
        return True
      case ProcessMode.Paused():
        pass
        return True
      case _:
        return False

  def pause(self):
    match self._mode:
      case ProcessMode.Normal(task):
        task.cancel()
        self._mode = ProcessMode.Paused()

  def resume(self):
    match self._mode:
      case ProcessMode.Paused(event):
        event.set()

  async def run(self, point: Optional[ProcessPoint], stack):
    total_duration = (self._data / am.ureg.sec).magnitude if not isinstance(self._data, str) else None

    if total_duration is not None:
      self._jump_progress = (point.progress if point else 0.0)

      while True:
        progress = self._jump_progress
        self._jump_progress = None

        remaining_duration = (total_duration * (1.0 - progress))
        task_time = time.time()

        yield am.ProcessExecEvent(
          duration=am.DurationTerm(remaining_duration),
          location=ProcessLocation(duration=total_duration, progress=progress),
          pausable=True,
          time=task_time
        )

        task = asyncio.create_task(asyncio.sleep(remaining_duration))
        self._mode = ProcessMode.Normal(task)

        try:
          await task
        except asyncio.CancelledError:
          self._task = None

          current_time = time.time()
          elapsed_time = current_time - task_time

          if total_duration is not None:
            progress += elapsed_time / total_duration
            remaining_duration = total_duration * (1.0 - progress)

          if self._jump_progress is None:
            self._jump_progress = progress

          location = ProcessLocation(
            duration=total_duration,
            paused=True,
            progress=progress
          )

          match self._mode:
            case ProcessMode.Halted():
              yield am.ProcessTerminationEvent(
                location=location,
                time=current_time
              )

              return
            case ProcessMode.Normal(task):
              # Just a jump
              pass
            case ProcessMode.Paused(event):
              yield am.ProcessPauseEvent(
                location=location,
                time=current_time
              )

              await event.wait()

              match self._mode:
                case ProcessMode.Halted():
                  yield am.ProcessTerminationEvent(
                    location=location,
                    time=current_time
                  )

                  return
                case ProcessMode.Paused():
                  # Resume
                  pass
        else:
          # The timer completed successfully.
          break
    else:
      yield am.ProcessExecEvent(
        duration=am.DurationTerm.forever(),
        location=ProcessLocation(duration=None, progress=0.0)
      )

      self._mode = ProcessMode.WaitingForever()
      await self._mode.event.wait()


    yield am.ProcessTerminationEvent(
      location=ProcessLocation(duration=total_duration, progress=1.0)
    )

  @staticmethod
  def import_point(data, /):
    return ProcessPoint(progress=data["progress"])

  @staticmethod
  def duration(data: Evaluable[PossiblyLocatedValue[ProcessData]], /):
    match data:
      case EvaluableConstantValue(LocatedValue('forever')):
        return am.DurationTerm.forever()
      case EvaluableConstantValue(LocatedValue(Quantity() as duration)):
        return am.DurationTerm((duration / am.ureg.second).magnitude)
      case _:
        return am.DurationTerm.unknown()

  @staticmethod
  def export_data(data: Evaluable[PossiblyLocatedValue[ProcessData]], /):
    return {
      "duration": export_evaluable(data, lambda value: (value / am.ureg.second).magnitude if not isinstance(value, str) else None)
    }


T = TypeVar('T')

def export_evaluable(target: Evaluable[PossiblyLocatedValue[T]], /, export_inner_value: Callable[[T], Any]):
  match target:
    case EvaluableConstantValue(inner_value):
      return {
        "type": "constant",
        "innerValue": export_inner_value(inner_value.value)
      }
    case EvaluablePythonExpr(contents) | am.EvaluableChain(EvaluablePythonExpr(contents)):
      return {
        "type": "expression",
        "contents": contents.value
      }
    case _:
      raise ValueError

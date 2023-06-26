import asyncio
import math
import time
from asyncio import Event, Future, Task
from dataclasses import dataclass, field
from typing import Any, Callable, Literal, Optional, TypeVar

import automancer as am
from pr1.fiber.expr import (Evaluable, EvaluableConstantValue,
                            EvaluablePythonExpr)
from pr1.reader import LocatedValue, PossiblyLocatedValue
from quantops import Quantity


ProcessData = Quantity | Literal['forever']

@dataclass
class ProcessLocation:
  duration: Optional[float] # in seconds, None = wait forever
  progress: float

  def export(self):
    return {
      "duration": self.duration,
      "progress": self.progress
    }


@dataclass
class ProcessPoint(am.BaseProcessPoint):
  progress: float


class Process(am.BaseClassProcess[ProcessData, ProcessLocation, ProcessPoint]):
  name = "_"
  namespace = am.PluginName("timer")

  def duration(self, data: Evaluable[PossiblyLocatedValue[ProcessData]], /):
    match data:
      case EvaluableConstantValue(LocatedValue('forever')):
        return am.DurationTerm.forever()
      case EvaluableConstantValue(LocatedValue(Quantity() as duration)):
        return am.DurationTerm((duration / am.ureg.second).magnitude)
      case _:
        return am.DurationTerm.unknown()

  def export_data(self, data: Evaluable[PossiblyLocatedValue[ProcessData]], /):
    return {
      "duration": export_evaluable(data, lambda value: (value / am.ureg.second).magnitude if not isinstance(value, str) else None)
    }

  def import_point(self, raw_point, /):
    return ProcessPoint(progress=raw_point["progress"])

  async def __call__(self, context: am.ProcessContext[ProcessData, ProcessLocation, ProcessPoint]):
    total_duration = (context.data / am.ureg.sec).magnitude if not isinstance(context.data, str) else None

    context.pausable = True

    # Infinite duration
    if total_duration is None:
      context.send_term(am.DurationTerm.forever())
      context.send_location(ProcessLocation(duration=None, progress=0.0))

      while True:
        try:
          await context.wait(Future())
        except am.ProcessPauseRequest:
          await context.checkpoint()

    # Finite duration
    else:
      progress = context.point.progress if context.point else 0.0

      while True:
        start_time = time.time()
        remaining_duration = total_duration * (1.0 - progress)

        context.send_location(ProcessLocation(total_duration, progress))
        context.send_term(am.DatetimeTerm(start_time + remaining_duration))

        try:
          await context.wait(asyncio.sleep(remaining_duration))
        except am.ProcessJumpRequest as e:
          progress = context.cast(e).point.progress
        except am.ProcessPauseRequest:
          pause_time = time.time()
          progress += (pause_time - start_time) / total_duration

          context.send_term(am.DurationTerm(total_duration * (1.0 - progress)))
          context.send_location(ProcessLocation(total_duration, progress))

          while True:
            try:
              await context.checkpoint()
            except am.ProcessJumpRequest as e:
              progress = context.cast(e).point.progress

              context.send_term(am.DurationTerm(total_duration * (1.0 - progress)))
              context.send_location(ProcessLocation(total_duration, progress))
            else:
              break
        except asyncio.CancelledError:
          halt_time = time.time()
          progress += (halt_time - start_time) / total_duration

          context.send_location(ProcessLocation(total_duration, progress))
          raise
        else:
          break

process = Process()


T = TypeVar('T')

def export_evaluable(target: Evaluable[PossiblyLocatedValue[T]], /, export_inner_value: Callable[[T], Any]):
  match target:
    case EvaluableConstantValue(inner_value):
      return {
        "type": "constant",
        "innerValue": export_inner_value(inner_value.value)
      }
    case EvaluablePythonExpr(contents) | am.EvaluableChain(EvaluablePythonExpr(contents)) | am.EvaluableDynamicValue(EvaluablePythonExpr(contents)):
      return {
        "type": "expression",
        "contents": contents.value
      }
    case _:
      raise ValueError

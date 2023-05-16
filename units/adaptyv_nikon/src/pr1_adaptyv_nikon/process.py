from dataclasses import dataclass
from types import EllipsisType
from typing import final

from pr1.fiber.eval import EvalContext
from pr1.fiber.langservice import Analysis
from pr1.fiber.process import (BaseProcess, BaseProcessPoint, ProcessExecEvent,
                               ProcessFailureEvent, ProcessTerminationEvent)
from pr1.master.analysis import MasterAnalysis
from pr1.util.misc import Exportable

from . import namespace
from .executor import Executor
from .parser import ProcessData
from .runner import Runner


@dataclass
class ProcessPoint(BaseProcessPoint):
    pass

@dataclass
class ProcessLocation(Exportable):
  def export(self):
    return {}

@final
class Process(BaseProcess[ProcessData, ProcessPoint]):
  name = "_"
  namespace = namespace

  def __init__(self, data: ProcessData, /, master):
    self._data = data
    self._executor: Executor = master.host.executors[namespace]
    self._master = master
    self._runner: Runner = master.runners[namespace]

  async def run(self, point, stack):
    if self._runner._points is None:
      raise Exception("Missing points")

    analysis = Analysis()
    exposure = analysis.add(self._data.exposure.eval(EvalContext(stack), final=True))
    objective = analysis.add(self._data.objective.eval(EvalContext(stack), final=True))
    optconf = analysis.add(self._data.optconf.eval(EvalContext(stack), final=True))
    output_path = analysis.add(self._data.output_path.eval(EvalContext(stack), final=True))

    if isinstance(exposure, EllipsisType) or isinstance(objective, EllipsisType) or isinstance(optconf, EllipsisType) or isinstance(output_path, EllipsisType):
      yield ProcessFailureEvent(
        analysis=MasterAnalysis.cast(analysis),
        location=ProcessLocation()
      )

      return

    yield ProcessExecEvent(
      analysis=MasterAnalysis.cast(analysis),
      location=ProcessLocation()
    )

    await self._executor.capture(
      chip_count=self._runner._chip_count,
      exposure=exposure.value.magnitude,
      objective=objective.value,
      optconf=optconf.value,
      output_path=(self._master.chip.dir / output_path.value),
      points=self._runner._points
    )

    yield ProcessTerminationEvent()

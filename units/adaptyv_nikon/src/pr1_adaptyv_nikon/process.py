from dataclasses import dataclass
from pathlib import Path
from types import EllipsisType
from typing import Protocol, final

import pr1 as am
from pr1.master.analysis import MasterAnalysis, MasterError
from pr1.util.misc import Exportable
from quantops import Quantity

from . import namespace
from .executor import Executor
from .runner import Runner


class ProcessData(Protocol):
  exposure: Quantity
  objective: str
  optconf: str
  save: Path
  z_offset: Quantity


@dataclass
class ProcessPoint(am.BaseProcessPoint):
  pass

@dataclass
class ProcessLocation(Exportable):
  def export(self):
    return {}

@final
class Process(am.BaseProcess[ProcessData, ProcessPoint]):
  name = "_"
  namespace = namespace

  def __init__(self, data: ProcessData, /, master):
    self._data = data
    self._executor: Executor = master.host.executors[namespace]
    self._runner: Runner = master.runners[namespace]

  async def run(self, point, stack):
    if self._runner._points is None:
      yield am.ProcessFailureEvent(
        analysis=MasterAnalysis(
          errors=[MasterError("Missing points")]
        )
      )

      return

    yield am.ProcessExecEvent(
      location=ProcessLocation()
    )

    await self._executor.capture(
      chip_count=self._runner._chip_count,
      exposure=(self._data.exposure / am.ureg.millisecond).magnitude,
      objective=self._data.objective,
      optconf=self._data.optconf,
      output_path=self._data.save,
      points=self._runner._points,
      z_offset=(self._data.z_offset / am.ureg.micrometer).magnitude
    )

    yield am.ProcessTerminationEvent()

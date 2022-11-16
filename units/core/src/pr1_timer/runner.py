import asyncio
from dataclasses import dataclass
import time
from typing import Any

from pr1.fiber.process import ProgramExecInfo
from pr1.units.base import BaseProcessRunner

from . import namespace


@dataclass
class ProcessState:
  progress: float = 0.0

  def export(self):
    return {
      "progress": self.progress
    }

class Process:
  def __init__(self, data: Any):
    self._data = data

  async def run(self, initial_state: Any):
    yield ProgramExecInfo(state=ProcessState(progress=0.0))
    await asyncio.sleep(self._data._value / 1000)
    yield ProgramExecInfo(state=ProcessState(progress=1.0))

class Runner(BaseProcessRunner):
  Process = Process

  def __init__(self, chip, *, host):
    self._chip = chip
    # self._executor = host.executors[namespace]

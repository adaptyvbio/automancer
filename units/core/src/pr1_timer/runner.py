import asyncio
from dataclasses import dataclass
import time
from typing import Any, Optional

from pr1.fiber.process import ProgramExecEvent
from pr1.units.base import BaseProcessRunner

from . import namespace


@dataclass
class ProcessState:
  progress: float
  paused: bool = False

  def export(self):
    return {
      "paused": self.paused,
      "progress": self.progress
    }

class Process:
  def __init__(self, data: Any):
    self._data = data
    self._pausing = False

    self._task: Any

  def halt(self):
    if not self._pausing:
      self._task.cancel()

  def pause(self):
    self._pausing = True
    self._task.cancel()

  async def run(self, initial_state: Optional[ProcessState]):
    progress = initial_state.progress if initial_state else 0.0
    remaining_duration = (self._data._value * (1.0 - progress)) / 1000.0

    while True:
      task_time = time.time()

      yield ProgramExecEvent(
        duration=remaining_duration,
        state=ProcessState(progress),
        time=task_time
      )

      self._task = asyncio.create_task(asyncio.sleep(remaining_duration))

      try:
        await self._task
      except asyncio.CancelledError:
        self._pausing = False
        self._task = None

        current_time = time.time()
        elapsed_time = current_time - task_time

        progress += elapsed_time / remaining_duration
        remaining_duration = (self._data._value * (1.0 - progress)) / 1000.0

        yield ProgramExecEvent(
          duration=remaining_duration,
          state=ProcessState(progress, paused=True),
          stopped=True,
          time=current_time
        )
      else:
        self._task = None
        break

    yield ProgramExecEvent(
      duration=0.0,
      state=ProcessState(1.0)
    )

class Runner(BaseProcessRunner):
  Process = Process

  def __init__(self, chip, *, host):
    self._chip = chip
    # self._executor = host.executors[namespace]

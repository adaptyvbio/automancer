import asyncio
from dataclasses import dataclass
import time
from typing import Any, Optional

from pr1.fiber.process import ProgramExecEvent
from pr1.units.base import BaseProcessRunner

from . import namespace


@dataclass
class ProcessLocation:
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

    self._resume_future: Optional[asyncio.Future] = None
    self._task: Any

  def halt(self):
    if not self._pausing:
      self._task.cancel()

  def pause(self):
    self._pausing = True
    self._task.cancel()

  def resume(self):
    assert self._resume_future
    self._resume_future.set_result(None)

  async def run(self, initial_state: Optional[ProcessLocation]):
    progress = initial_state.progress if initial_state else 0.0

    total_duration = self._data._value / 1000.0
    remaining_duration = total_duration * (1.0 - progress)

    while True:
      task_time = time.time()

      yield ProgramExecEvent(
        duration=remaining_duration,
        state=ProcessLocation(progress),
        time=task_time
      )

      self._task = asyncio.create_task(asyncio.sleep(remaining_duration))

      try:
        await self._task
      except asyncio.CancelledError:
        self._pausing = False
        self._resume_future = asyncio.Future()
        self._task = None

        current_time = time.time()
        elapsed_time = current_time - task_time

        progress += elapsed_time / total_duration
        remaining_duration = total_duration * (1.0 - progress)

        yield ProgramExecEvent(
          duration=remaining_duration,
          state=ProcessLocation(progress, paused=True),
          stopped=True,
          time=current_time
        )

        await self._resume_future
      else:
        self._task = None
        break

    yield ProgramExecEvent(
      duration=0.0,
      state=ProcessLocation(1.0)
    )

class Runner(BaseProcessRunner):
  Process = Process

  def __init__(self, chip, *, host):
    self._chip = chip
    # self._executor = host.executors[namespace]

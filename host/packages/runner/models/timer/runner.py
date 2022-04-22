import asyncio
import time

from . import namespace
from ..base import BaseProcessRunner


class Runner(BaseProcessRunner):
  def __init__(self, executor, chip):
    self._chip = chip
    self._executor = executor

    self._nominal_duration = None
    self._start_state = None
    self._start_time = None

  def get_state(self):
    if not self._start_time:
      return { 'progress': 0.0 }

    current_time = time.time()

    start_progress = self._start_state['progress'] if self._start_state else 0.0
    new_progress = (current_time - self._start_time) / self._nominal_duration

    return {
      'progress': start_progress + new_progress
    }

  async def run_process(self, segment, seg_index, state):
    self._nominal_duration = segment[namespace]['duration']
    duration = self._nominal_duration * ((1.0 - state['progress']) if state else 1.0)

    self._start_state = state
    self._start_time = time.time()

    if duration > 0.0:
      await asyncio.sleep(duration)
      # raise Exception("Foo")

  def pause_process(self, segment, seg_index):
    pass

  def leave_segment(self, segment, seg_index):
    self._nominal_duration = None
    self._start_state = None
    self._start_time = None

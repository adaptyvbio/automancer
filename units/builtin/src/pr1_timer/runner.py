import asyncio
import pickle
import time
from collections import namedtuple

from pr1.units.base import BaseProcessRunner

from . import logger, namespace


class Runner(BaseProcessRunner):
  def __init__(self, *, chip, host):
    self._chip = chip
    self._host = host

    self._nominal_duration = None
    self._start_state = None
    self._start_time = None

  def get_state(self):
    if not self._start_time:
      return { 'progress': 0.0 }

    current_time = time.time() * 1000

    start_progress = self._start_state['progress'] if self._start_state else 0.0
    new_progress = (current_time - self._start_time) / self._nominal_duration

    return {
      'progress': start_progress + new_progress
    }

  def export_state(self, state):
    return { "progress": state['progress'] }

  def import_state(self, data_state):
    return { 'progress': data_state["progress"] if data_state is not None else 0 }


  async def run_process(self, segment, seg_index, state):
    self._nominal_duration = segment[namespace]['duration']
    duration = self._nominal_duration * ((1.0 - state['progress']) if state else 1.0)

    self._start_state = state
    self._start_time = time.time() * 1000

    if duration > 0.0:
      await asyncio.sleep(duration / 1000)

  def pause_process(self, segment, seg_index):
    pass

  def leave_segment(self, segment, seg_index):
    self._nominal_duration = None
    self._start_state = None
    self._start_time = None

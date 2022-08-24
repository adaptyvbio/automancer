import asyncio
import time

from pr1.units.base import BaseProcessRunner

from . import namespace


class Runner(BaseProcessRunner):
  def __init__(self, chip, *, host):
    self._chip = chip
    self._executor = host.executors[namespace]
    self._rotation_task = None

  def get_state(self):
    return dict()

  def enter_segment(self, segment, seg_index):
    valve = segment[namespace]['valve']

    if (valve is not None) and (valve != self._executor._main_device._valve_target):
      self._rotation_task = asyncio.create_task(self._executor._main_device.try_rotate(valve))

  async def run_process(self, segment, seg_index, state):
    if self._rotation_task:
      await self._rotation_task
      self._rotation_task = None

  def export_state(self, state):
    return { "progress": 0 }

  def import_state(self, data_state):
    return dict()

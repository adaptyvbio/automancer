import asyncio

from pr1.chip import UnsupportedChipRunnerError
from pr1.units.base import BaseProcessRunner

from . import namespace


class Runner(BaseProcessRunner):
  _version = 1

  def __init__(self, chip, *, host):
    self._chip = chip
    self._executor = host.executors[namespace]
    self._rotation_task = None

  def get_state(self):
    return dict()

  def enter_segment(self, segment, seg_index):
    futures = list()
    valves = segment[namespace]['valves']

    for device in self._executor._devices.values():
      valve = valves[device.id]

      if (valve is not None) and (valve != device._valve_target):
        futures.append(asyncio.create_task(device.nodes['rotation'].write(valve - 1)))

    if futures:
      self._rotation_task = asyncio.gather(*futures)

  async def run_process(self, segment, seg_index, state):
    if self._rotation_task:
      await self._rotation_task
      self._rotation_task = None

  def export_state(self, state):
    return { "progress": 0 }

  def import_state(self, data_state):
    return dict()

  def serialize(self):
    return self._version, { device.id: device.serialize() for device in self._executor._devices.values() }

  def unserialize(self, state):
    version, data_devices = state

    if version != self._version:
      raise UnsupportedChipRunnerError()

    # TODO: add checks

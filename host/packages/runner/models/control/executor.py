# from ..base import BaseRunner

from .runner import BinaryPermutation, Runner
from .drivers import mock, numato
from ...device import DeviceInformation
from ...util.schema import List, Optional, ParseType, Schema


drivers = {
  'mock': mock.Driver,
  'numato': numato.Driver
}


class Executor: # (BaseExecutor):
  def __init__(self, conf):
    self._devices = list()
    self._valves = dict()

    schema = Schema({
      'devices': List({
        'driver': str,
        'name': Optional(str),
        'valves': List({
          'channel': ParseType(int),
          'name': str
        })
      })
    })

    conf = schema.transform(conf)

    for spec in conf.get('devices', list()):
      Driver = drivers[spec['driver']]
      driver = Driver.from_spec(spec)

      self._devices.append({
        'driver': driver,
        'name': spec.get('name'),
        'range': [len(self._valves), len(spec['valves'])],
        'valves': [valve['channel'] for valve in spec['valves']]
      })

      self._valves.update({
        valve['name']: len(self._valves) + index for index, valve in enumerate(spec['valves'])
      })

    print(self._devices)

  def get_device_info(self):
    return [
      DeviceInformation(
        id=str(index),
        info=dict(),
        name=(device['name'] or "Untitled control device")
      ) for index, device in enumerate(self._devices)
    ]

  def export(self):
    return {
      "valves": self._valves
    }

  async def initialize(self):
    pass

    # for device in self._devices:
    #   device['driver'].initialize()

  def create_runner(self, chip):
    return Runner(self, chip)

  def set(self, change, mask):
    self._signal = (change & mask) | (self._signal & ~mask)
    self._write()

  def write(self, signal):
    for device in self._devices:
      [start, length] = device['range']
      device_signal = (signal >> start) & ((1 << length) - 1)
      driver_signal = sum([1 << channel for index, channel in enumerate(device['valves']) if (device_signal & (1 << index)) > 0])
      device['driver'].write(driver_signal)

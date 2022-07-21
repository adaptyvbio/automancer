from collections import namedtuple
import sys

from . import logger
from .drivers import drivers
from .model import Model
from .runner import Runner
from ..base import BaseExecutor
from ...device import DeviceInformation
from ...reader import LocatedError
from ...util import schema as sc


Device = namedtuple("Device", ['driver', 'id', 'name', 'range', 'valves'])

device_partial_schema = {
  'name': sc.Optional(str),
  'valves': sc.List({
    'channel': sc.ParseType(int),
    'name': str
  })
}

driver_partial_schemas = [
  { 'driver': 'mock' },
  { 'driver': 'numato', 'port': str }
]

schema = sc.Schema({
  'devices': sc.Optional(sc.List(sc.Or(*[{
    **driver_partial_schema,
    **device_partial_schema
  } for driver_partial_schema in driver_partial_schemas])))
})


class Executor(BaseExecutor):
  def __init__(self, conf, *, host):
    self.models = dict()

    self._devices = list()
    self._host = host
    self._valves = dict()

    conf = schema.transform(conf)

    for spec in conf.get('devices', list()):
      Driver = drivers[spec['driver']]
      driver = Driver.from_spec(spec)

      self._devices.append(Device(
        driver=driver,
        id=("control." + str(len(self._devices))),
        name=(spec.get('name') or driver.get_name()),
        range=[len(self._valves), len(spec['valves'])],
        valves=[valve['channel'] for valve in spec['valves']]
      ))

      for valve in spec['valves']:
        valve_name = valve['name']
        if valve_name in self._valves:
          raise valve_name.error(f"Duplicate valve name '{valve_name}'")

        self._valves[valve_name] = len(self._valves)

  async def initialize(self):
    logger.debug("Loading models")

    for path in (self._host.data_dir / "models").glob("**/*.yml"):
      try:
        model = Model.load(path)
        self.models[model.id] = model
      except LocatedError as e:
        e.display()
        sys.exit(1)

    logger.debug(f"Done loading {len(self.models)} models")


  def get_devices(self):
    return [
      DeviceInformation(
        id=device.id,
        name=(device.name or "Untitled control device")
      ) for device in self._devices
    ]

  def export(self):
    return {
      "models": {
        model.id: model.export() for model in self.models.values()
      },
      "valves": self._valves
    }

  def set(self, change, mask):
    self._signal = (change & mask) | (self._signal & ~mask)
    self._write()

  def write(self, signal):
    for device in self._devices:
      [start, length] = device.range
      device_signal = (signal >> start) & ((1 << length) - 1)
      driver_signal = sum([1 << channel for index, channel in enumerate(device.valves) if (device_signal & (1 << index)) > 0])
      device.driver.write(driver_signal)

  def supports(version):
    return version == "0"

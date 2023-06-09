import json

from pr1.units.base import BaseExecutor
from pr1.util import schema as sc
from pr1.util.misc import fast_hash
from pr1.util.parser import Identifier

from .devices.relay_board import RelayBoardDevice


conf_schema = sc.Schema({
  'devices': sc.Optional(sc.List({
    'address': sc.Optional(str),
    'id': Identifier(),
    'label': sc.Optional(str),
    'relay_count': sc.ParseType(int),
    'serial': sc.Optional(str)
  }))
})


class Executor(BaseExecutor):
  def __init__(self, conf, *, host):
    self._conf = conf_schema.transform(conf)
    self._host = host
    self._devices = dict()

    for device_conf in self._conf.get('devices', dict()):
      device_id = device_conf['id']

      if device_id in self._host.devices:
        raise device_id.error(f"Duplicate device id '{device_id}'")

      device = RelayBoardDevice(
        address=(device_conf['address'].value if 'address' in device_conf else None),
        id=device_id.value,
        label=(device_conf['label'].value if 'label' in device_conf else None),
        relay_count=device_conf['relay_count'],
        serial_number=(device_conf['serial'].value if 'serial' in device_conf else None)
      )

      self._devices[device_id.value] = device
      self._host.devices[device_id.value] = device

  async def initialize(self):
    for device in self._devices.values():
      await device.initialize()

  async def destroy(self):
    for device in self._devices.values():
      del self._host.devices[device.id]
      await device.destroy()

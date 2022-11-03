import logging

from pr1.units.base import BaseExecutor
from pr1.util import schema as sc
from pr1.util.parser import Identifier

from .device import OPCUADevice, variants_map


logging.getLogger("asyncua").setLevel(logging.WARNING)


conf_schema = sc.Schema({
  'devices': sc.Optional(sc.List({
    'address': str,
    'label': sc.Optional(str),
    'id': Identifier(),
    'nodes': sc.Noneable(sc.List({
      'id': str,
      'label': sc.Optional(str),
      'location': str,
      'type': sc.Or(*variants_map.keys())
    }))
  }))
})


class Executor(BaseExecutor):
  def __init__(self, conf, *, host):
    conf = conf_schema.transform(conf)

    self._devices = dict()
    self._host = host

    for device_conf in conf.get('devices', list()):
      device_id = device_conf['id']

      if device_id in self._host.devices:
        raise device_id.error(f"Duplicate device id '{device_id}'")

      device = OPCUADevice(
        address=device_conf['address'].value,
        id=device_id.value,
        label=(device_conf['label'].value if 'label' in device_conf else None),
        nodes_conf=device_conf['nodes']
      )

      self._devices[device_id.value] = device
      self._host.devices[device_id.value] = device

  async def initialize(self):
    for device in self._devices.values():
      await device.initialize()

  async def destroy(self):
    for device in self._devices.values():
      await device.destroy()
      del self._host.devices[device.id]

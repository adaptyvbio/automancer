from pr1.units.base import BaseExecutor
from pr1.util import schema as sc
from pr1.util.parser import Identifier

from .devices.rotary import RotaryValveDevice


conf_schema = sc.Schema({
  'devices': sc.Optional(sc.List({
    'address': sc.Optional(str),
    'id': Identifier(),
    'label': sc.Optional(str),
    'serial': sc.Optional(str),
    'valve_count': sc.ParseType(int)
  }))
})


class Executor(BaseExecutor):
  def __init__(self, conf, *, host):
    self._conf = conf_schema.transform(conf)
    self._devices = dict()
    self._host = host

    for device_conf in self._conf.get('devices', list()):
      device_id = device_conf['id']

      if device_id in self._host.devices:
        raise device_id.error(f"Duplicate device id '{device_id}'")

      device = RotaryValveDevice(
        address=(device_conf['address'].value if 'address' in device_conf else None),
        id=device_conf['id'].value,
        label=(device_conf['label'].value if 'label' in device_conf else None),
        serial_number=(device_conf['serial'].value if 'serial' in device_conf else None),
        valve_count=device_conf['valve_count'].value
      )

      self._devices[device_id] = device
      self._host.devices[device_id] = device

  async def initialize(self):
    for device in self._devices.values():
      await device.initialize()

  async def destroy(self):
    for device in self._devices.values():
      del self._host.devices[device.id]
      await device.destroy()

  def export(self):
    return {
      "devices": {
        device.id: {
          "id": device.id,
          "label": device.label
        } for device in self._devices.values()
      }
    }

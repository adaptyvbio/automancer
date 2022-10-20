from pr1.units.base import BaseExecutor
from pr1.util import schema as sc
from pr1.util.parser import Identifier

from .devices.rotary import RotaryValveDevice
from .devices.rotary_mock import MockRotaryValveDevice


conf_schema = sc.Schema({
  'devices': sc.Optional(sc.List({
    'address': str,
    'model': sc.Or('rotary_valve'),
    'id': Identifier(),
    'label': sc.Optional(str),
    'valve_count': sc.ParseType(int)
  }))
})


class Executor(BaseExecutor):
  def __init__(self, conf, *, host):
    self._conf = conf_schema.transform(conf)
    self._devices = dict()
    self._host = host

    for device_conf in self._conf.get('devices', list()):
      device_addr = device_conf['address']
      device_id = device_conf['id']

      if device_id in self._host.devices:
        raise device_id.error(f"Duplicate device id '{device_id}'")

      match device_conf['model']:
        case 'rotary_valve':
          kwargs = dict(
            id=device_id,
            label=device_conf.get('label'),
            update_callback=self._host.update_callback,
            valve_count=device_conf['valve_count']
          )

          if device_addr == ':mock:':
            device = MockRotaryValveDevice(**kwargs)
          else:
            device = RotaryValveDevice(address=device_addr, **kwargs)

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

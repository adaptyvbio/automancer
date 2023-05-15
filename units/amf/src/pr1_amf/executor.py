from typing import Any
from pr1.fiber.langservice import Attribute, DictType, IdentifierType, ListType, PrimitiveType, StrType
from pr1.host import Host
from pr1.units.base import BaseExecutor

from .device import RotaryValveDevice


class Executor(BaseExecutor):
  options_type = DictType({
    'devices': Attribute(ListType(DictType({
      'address': Attribute(StrType(), optional=True),
      'id': IdentifierType(),
      'label': Attribute(StrType(), optional=True),
      'serial': Attribute(StrType(), optional=True),
      'valve_count': PrimitiveType(int)
    })), optional=True)
  })

  def __init__(self, conf: Any, *, host: Host):
    self._devices = dict[str, RotaryValveDevice]()
    self._host = host

    if conf:
      for device_conf in conf.get('devices', list()):
        device_id = device_conf['id']

        if device_id in self._host.devices:
          raise device_id.error(f"Duplicate device id '{device_id}'")

        device = RotaryValveDevice(
          address=(device_conf['address'].value if 'address' in device_conf else None),
          id=device_id.value,
          label=(device_conf['label'].value if 'label' in device_conf else None),
          pool=self._host.pool,
          serial_number=(device_conf['serial'].value if 'serial' in device_conf else None),
          valve_count=device_conf['valve_count'].value
        )

        self._devices[device_id.value] = device
        self._host.devices[device_id.value] = device

  async def initialize(self):
    for device in self._devices.values():
      await device.initialize()

  async def destroy(self):
    for device in self._devices.values():
      del self._host.devices[device.id]

  def export(self):
    return {
      "devices": {
        device.id: {
          "id": device.id,
          "label": device.label
        } for device in self._devices.values()
      }
    }

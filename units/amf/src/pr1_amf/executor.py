from typing import Any
from pr1.fiber.langservice import Attribute, DictType, IdentifierType, ListType, PrimitiveType, StrType
from pr1.host import Host
from pr1.units.base import BaseExecutor
from pr1.util.asyncio import try_all
from pr1.util.pool import Pool

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
          serial_number=(device_conf['serial'].value if 'serial' in device_conf else None),
          valve_count=device_conf['valve_count'].value
        )

        self._devices[device_id.value] = device
        self._host.devices[device_id.value] = device

  async def start(self):
    async with Pool.open() as pool:
      await try_all([
        pool.wait_until_ready(device.start()) for device in self._devices.values()
      ])

      yield

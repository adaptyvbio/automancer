from typing import Any, Optional, Protocol

import automancer as am

from .device import RotaryValveDevice


class DeviceConf(Protocol):
  address: Optional[str]
  id: str
  label: Optional[str]
  serial: Optional[str]
  valve_count: int

class Conf(Protocol):
  devices: list[DeviceConf]

class Executor(am.BaseExecutor):
  options_type = am.RecordType({
    'devices': am.Attribute(am.ListType(am.RecordType({
      'address': am.Attribute(am.StrType(), default=None),
      'id': am.IdentifierType(),
      'label': am.Attribute(am.StrType(), default=None),
      'serial': am.Attribute(am.StrType(), default=None),
      'valve_count': am.IntType(mode='positive')
    })), default=list())
  })

  def __init__(self, conf: Any, *, host):
    self._devices = dict[str, RotaryValveDevice]()
    self._host = host

    executor_conf: Conf = conf.dislocate()

    for device_conf in executor_conf.devices:
      if device_conf.id in self._host.devices:
        raise Exception(f"Duplicate device id '{device_conf.id}'")

      device = RotaryValveDevice(
        address=device_conf.address,
        id=device_conf.id,
        label=device_conf.label,
        serial_number=device_conf.serial,
        valve_count=device_conf.valve_count
      )

      self._devices[device.id] = device
      self._host.devices[device.id] = device

  async def start(self):
    async with am.Pool.open() as pool:
      await am.try_all([
        pool.wait_until_ready(device.start()) for device in self._devices.values()
      ])

      yield

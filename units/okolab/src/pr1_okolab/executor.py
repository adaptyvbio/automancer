from typing import Any, Literal, Optional, Protocol

import automancer as am

from .device import MasterDevice, WorkerDevice


class WorkerConf(Protocol):
  id: str
  description: Optional[str]
  label: Optional[str]
  side: Optional[Literal['glass', 'metal']]
  type: int

class DeviceConf(Protocol):
  id: str
  address: Optional[str]
  device1: Optional[WorkerConf]
  device2: Optional[WorkerConf]
  label: Optional[str]
  serial: Optional[str]

class Conf(Protocol):
  devices: list[DeviceConf]


worker_type = am.RecordType({
  'id': am.IdentifierType(),
  'description': am.Attribute(am.StrType(), default=None),
  'label': am.Attribute(am.StrType(), default=None),
  'side': am.Attribute(am.EnumType('glass', 'metal'), default=None),
  'type': am.IntType(mode='positive')
})

class Executor(am.BaseExecutor):
  options_type = am.RecordType({
    'devices': am.Attribute(am.ListType(am.DictType({
      'address': am.Attribute(am.StrType(), default=None),
      'device1': am.Attribute(worker_type, default=None),
      'device2': am.Attribute(worker_type, default=None),
      'id': am.IdentifierType(),
      'serial': am.Attribute(am.StrType(), default=None)
    })), default=list())
  })

  def __init__(self, conf: Any, *, host: am.Host):
    self._devices = dict[str, MasterDevice]()
    self._host = host

    executor_conf: Conf = conf.dislocate()

    for device_conf in executor_conf.devices:
      if device_conf.id in self._host.devices:
        raise Exception(f"Duplicate master device id '{device_conf.id}'")

      master_device = MasterDevice(
        id=device_conf.id,
        address=device_conf.address,
        label=device_conf.label,
        serial_number=device_conf.serial
      )

      self._devices[master_device.id] = master_device
      self._host.devices[master_device.id] = master_device

      def create_worker(worker_conf: WorkerConf, *, index: int):
        if worker_conf.id in self._host.devices:
          raise Exception(f"Duplicate worker device id '{worker_conf.id}'")

        worker_device = WorkerDevice(
          description=worker_conf.description,
          id=worker_conf.id,
          index=index,
          label=worker_conf.label,
          master=master_device,
          side=(worker_conf.side and { 'glass': 1, 'metal': 2 }.get(worker_conf.side)),
          type=worker_conf.type
        )

        match index:
          case 1: master_device._worker1 = worker_device
          case 2: master_device._worker2 = worker_device

        self._host.devices[worker_device.id] = worker_device

      if device_conf.device1:
        create_worker(device_conf.device1, index=1)
      if device_conf.device2:
        create_worker(device_conf.device2, index=2)

  async def start(self):
    async with am.Pool.open() as pool:
      await am.try_all([
        pool.wait_until_ready(device.start()) for device in self._devices.values()
      ])

      yield

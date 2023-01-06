from typing import Any

from pr1.fiber.langservice import Attribute, DictType, EnumType, IdentifierType, ListType, PrimitiveType, StrType
from pr1.host import Host
from pr1.units.base import BaseExecutor
from pr1.util import schema as sc
from pr1.util.parser import Identifier

from .device import MasterDevice, WorkerDevice


worker_type = DictType({
  'id': IdentifierType(),
  'description': Attribute(StrType(), optional=True),
  'label': Attribute(StrType(), optional=True),
  'side': Attribute(EnumType('glass', 'metal'), optional=True),
  'type': PrimitiveType(int)
})

class Executor(BaseExecutor):
  options_type = DictType({
    'devices': Attribute(ListType(DictType({
      'address': Attribute(StrType(), optional=True),
      'device1': Attribute(worker_type, optional=True),
      'device2': Attribute(worker_type, optional=True),
      'id': IdentifierType(),
      'serial': Attribute(StrType(), optional=True)
    })), optional=True)
  })

  def __init__(self, conf: Any, *, host: Host):
    self._conf = conf
    self._devices = dict[str, MasterDevice]()
    self._host = host

    for device_conf in self._conf.get('devices', list()):
      master_id = device_conf['id']

      if master_id in self._host.devices:
        raise master_id.error(f"Duplicate master device id '{master_id}'")

      master_device = MasterDevice(
        id=master_id.value,
        address=(device_conf['address'].value if 'address' in device_conf else None),
        label=(device_conf['label'].value if 'label' in device_conf else None),
        serial_number=(device_conf['serial'].value if 'serial' in device_conf else None)
      )

      self._devices[master_id.value] = master_device
      self._host.devices[master_id.value] = master_device

      def create_worker(worker_conf, *, index: int):
        worker_id = worker_conf['id']

        if worker_id in self._host.devices:
          raise worker_id.error(f"Duplicate worker device id '{worker_id}'")

        worker_device = WorkerDevice(
          description=(worker_conf['description'] if 'description' in worker_conf else None),
          id=worker_id.value,
          index=index,
          label=(worker_conf['label'].value if 'label' in worker_conf else None),
          master=master_device,
          side=({ 'glass': 1, 'metal': 2 }.get(worker_conf.get('side'), 0)),
          type=worker_conf['type']
        )

        master_device._workers.add(worker_device)
        self._host.devices[worker_id.value] = worker_device

      if 'device1' in device_conf:
        create_worker(device_conf['device1'], index=1)
      if 'device2' in device_conf:
        create_worker(device_conf['device2'], index=2)

  async def initialize(self):
    for device in self._devices.values():
      await device.initialize()

  async def destroy(self):
    for device in self._devices.values():
      del self._host.devices[device.id]

      for worker in device._workers:
        del self._host.devices[worker.id]

      await device.destroy()

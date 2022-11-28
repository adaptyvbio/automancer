import uuid

from pr1.units.base import BaseExecutor
from pr1.util import schema as sc
from pr1.util.parser import Identifier

from .device import MasterDevice, WorkerDevice


worker_schema = sc.Schema({
  'id': Identifier(),
  'label': sc.Optional(str),
  'side': sc.Optional(sc.Or('glass', 'metal')),
  'type': sc.ParseType(int)
})

conf_schema = sc.Schema({
  'devices': sc.Optional(sc.List({
    'id': Identifier(),
    'address': sc.Optional(str),
    'label': sc.Optional(str),
    'serial': sc.Optional(str),
    'device1': sc.Optional(worker_schema),
    'device2': sc.Optional(worker_schema)
  }))
})

class Executor(BaseExecutor):
  def __init__(self, conf, *, host):
    self._conf = conf_schema.transform(conf)
    self._devices = dict()
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

        match worker_conf.get('side'):
          case 'glass':
            side = 1
          case 'metal':
            side = 2
          case _:
            side = 0

        worker_device = WorkerDevice(
          id=worker_id.value,
          index=index,
          label=(worker_conf['label'].value if 'label' in worker_conf else None),
          master=master_device,
          side=side,
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

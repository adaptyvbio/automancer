import uuid

from pr1.units.base import BaseExecutor
from pr1.util import schema as sc
from pr1.util.parser import Identifier

from .device import MasterDevice, WorkerDevice


conf_schema = sc.Schema({
  'devices': sc.Optional(sc.List({
    'id': sc.Optional(Identifier()),
    'address': sc.Optional(str),
    'label': sc.Optional(str),
    'serial': sc.Optional(str),
    'workers': sc.Optional(sc.Noneable(sc.List({
      'id': Identifier(),
      'label': sc.Optional(Identifier()),
      'side': sc.Optional(sc.Or('glass', 'metal')),
      'type': sc.ParseType(int)
    })))
  }))
})

class Executor(BaseExecutor):
  def __init__(self, conf, *, host):
    self._conf = conf_schema.transform(conf)
    self._devices = dict()
    self._host = host

    for device_conf in self._conf.get('devices', list()):
      master_id = device_conf.get('id') or str(uuid.uuid4())

      if master_id in self._host.devices:
        raise master_id.error(f"Duplicate master device id '{master_id}'")

      master_device = MasterDevice(
        id=master_id,
        address=device_conf.get('address'),
        label=device_conf.get('label'),
        serial_number=device_conf.get('serial')
      )

      self._devices[master_id] = master_device
      self._host.devices[master_id] = master_device

      devices_conf = device_conf.get('workers') or list()

      if len(devices_conf) > 2:
        raise devices_conf.error(f"Too many workers for master device '{master_id}'")

      for worker_index, worker_conf in enumerate(devices_conf):
        worker_id = worker_conf['id']

        if worker_id in self._host.devices:
          raise worker_id.error(f"Duplicate worker device id '{worker_id}'")

        worker_device = WorkerDevice(
          id=worker_id,
          index=(worker_index + 1),
          label=worker_conf.get('label'),
          master=master_device,
          side=worker_conf.get('side'),
          type=worker_conf['type']
        )

        master_device._workers.add(worker_device)

        self._host.devices[worker_id] = worker_device

  async def initialize(self):
    for device in self._devices.values():
      await device.initialize()

  async def destroy(self):
    for device in self._devices.values():
      await device.destroy()

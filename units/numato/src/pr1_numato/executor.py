import json

from pr1.units.base import BaseExecutor
from pr1.util import schema as sc
from pr1.util.misc import fast_hash
from pr1.util.parser import Identifier

from .devices.relay_board import RelayBoardDevice


conf_schema = sc.Schema({
  'devices': sc.List({
    'address': str,
    'id': Identifier(),
    'kind': sc.Or('relayboard'),
    'label': sc.Optional(str),
    'relay_count': sc.ParseType(int)
  })
})


class Executor(BaseExecutor):
  def __init__(self, conf, *, host):
    self._conf = conf_schema.transform(conf)
    self._host = host
    self._devices = dict()

    for device_conf in self._conf.get('devices', dict()):
      device_addr = device_conf['address']
      device_id = device_conf['id']

      if device_id in self._host.devices:
        raise device_id.error(f"Duplicate device id '{device_id}'")

      if device_conf['kind'] == 'relayboard':
        device = RelayBoardDevice(
          address=device_addr,
          id=device_id,
          label=device_conf.get('label'),
          relay_count=device_conf['relay_count'],
          update_callback=self._host.update_callback
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

  @property
  def hash(self):
    return fast_hash(json.dumps({
      device.id: device.hash for device in self._devices.values()
    }))

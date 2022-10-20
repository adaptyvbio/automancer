from pr1.units.base import BaseExecutor
from pr1.util import schema as sc
from pr1.util.parser import Identifier

from .device import Device


conf_schema = sc.Schema({
  'devices': sc.Optional(sc.List({
    'id': Identifier(),
    'label': sc.Optional(str),
    'serial': str,
    'devices': sc.List({
      'side': sc.Optional(sc.Or('glass', 'metal')),
      'type': int
    })
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

      device = Device(
        id=device_id,
        label=device_conf.get('label', device_id),
        serial_number=device_conf['serial'],

        devices=device_conf['devices']
      )

      self._devices[device_id] = device
      self._host.devices[device_id] = device

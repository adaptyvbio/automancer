import logging
from typing import Any

from pr1.fiber.langservice import (Analysis, ArbitraryQuantityType, Attribute, DictType,
                                   EnumType, IdentifierType, InvalidValueError, ListType, QuantityType, StrType)
from pr1.host import Host
from pr1.units.base import BaseExecutor
from pr1.util import schema as sc
from pr1.util.parser import Identifier

from .device import OPCUADevice, OPCUADeviceScalarNode, nodes_map, variants_map

logging.getLogger("asyncua").setLevel(logging.WARNING)


class Executor(BaseExecutor):
  options_type = DictType({
    'devices': ListType(DictType({
      'address': StrType(),
      'id': IdentifierType(),
      'label': Attribute(StrType(), optional=True),
      'nodes': ListType(DictType({
        'description': Attribute(StrType(), optional=True),
        'id': StrType(),
        'label': Attribute(StrType(), optional=True),
        'location': StrType(),
        'max': Attribute(ArbitraryQuantityType(), optional=True),
        'min': Attribute(ArbitraryQuantityType(), optional=True),
        'type': EnumType(*variants_map.keys()),
        'unit': Attribute(ArbitraryQuantityType(), optional=True)
      }))
    }))
  })

  def __init__(self, conf: Any, *, host: Host):
    self._conf = conf
    self._host = host

  def load(self, context):
    analysis = Analysis()

    self._devices = dict()

    for device_conf in self._conf['devices']:
      device_id = device_conf['id']

      if device_id in self._host.devices:
        raise device_id.error(f"Duplicate device id '{device_id}'")

      for node_conf in device_conf['nodes']:
        is_numeric = nodes_map[node_conf['type']] == OPCUADeviceScalarNode

        if not is_numeric:
          for key in ['unit', 'min', 'max']:
            if key in node_conf:
              # analysis.errors.append(InvalidValueError(node_conf.get_key(key)))
              analysis.errors.append(InvalidValueError(node_conf[key]))

        # unit = node_conf['unit'].value if 'unit' in node_conf else context.ureg.Quantity('1')

        # if 'min' in node_conf:
        #   min_analysis, min_value = QuantityType.check(node_conf['min'].value, unit, target=node_conf['min'])
        #   analysis += min_analysis

      device = OPCUADevice(
        address=device_conf['address'].value,
        id=device_id.value,
        label=(device_conf['label'].value if 'label' in device_conf else None),
        nodes_conf=device_conf['nodes']
      )

      self._devices[device_id.value] = device
      self._host.devices[device_id.value] = device

    return analysis

  async def initialize(self):
    for device in self._devices.values():
      await device.initialize()

  async def destroy(self):
    for device in self._devices.values():
      await device.destroy()
      del self._host.devices[device.id]

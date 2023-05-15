import logging
from types import EllipsisType
from typing import Any

from pint import Quantity
from pr1.ureg import ureg
from pr1.reader import LocatedValue
from pr1.error import Diagnostic, ErrorDocumentReference
from pr1.fiber.langservice import (Analysis, ArbitraryQuantityType, Attribute,
                                   BoolType, DictType, EnumType,
                                   IdentifierType, ListType, QuantityType,
                                   StrType)
from pr1.units.base import BaseExecutor
from pr1.host import Host

from .device import OPCUADevice, OPCUADeviceNumericNode, nodes_map, variants_map


logging.getLogger("asyncua").setLevel(logging.WARNING)


class OPCUAConfigurationError(Diagnostic):
  def __init__(self, message: str, target: LocatedValue, /):
    super().__init__(
      message,
      references=[ErrorDocumentReference.from_value(target)]
    )


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
        'unit': Attribute(ArbitraryQuantityType(), optional=True),
        'writable': Attribute(BoolType(), optional=True)
      }))
    }))
  })

  def __init__(self, conf: Any, *, host: Host):
    self._conf = conf
    self._host = host

  def load(self, context):
    analysis = Analysis()

    self._devices = dict[str, OPCUADevice]()

    if self._conf:
      for device_conf in self._conf['devices']:
        failure = False
        device_id = device_conf['id']

        if device_id in self._host.devices:
          raise device_id.error(f"Duplicate device id '{device_id}'")

        for node_conf in device_conf['nodes']:
          if nodes_map[node_conf['type']] is OPCUADeviceNumericNode:
            quantity: Quantity = node_conf['unit'].value if 'unit' in node_conf else ureg.Quantity('1')

            if 'min' in node_conf:
              result = analysis.add(QuantityType.check(node_conf['min'].value, quantity.units, target=node_conf['min']))
              failure = failure or isinstance(result, EllipsisType)
            if 'max' in node_conf:
              result = analysis.add(QuantityType.check(node_conf['max'].value, quantity.units, target=node_conf['max']))
              failure = failure or isinstance(result, EllipsisType)
          else:
            for key in ['unit', 'min', 'max']:
              if key in node_conf:
                analysis.errors.append(OPCUAConfigurationError("Invalid property for non-numeric node", node_conf[key]))

        if not failure:
          device = OPCUADevice(
            address=device_conf['address'].value,
            id=device_id.value,
            label=(device_conf['label'].value if 'label' in device_conf else None),
            nodes_conf=device_conf['nodes'],
            pool=self._host.pool
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

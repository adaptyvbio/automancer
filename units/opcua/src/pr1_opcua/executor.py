import logging
from types import EllipsisType
from typing import Any, NotRequired, Optional, Protocol

import pr1 as am
from pr1.error import Diagnostic, DiagnosticDocumentReference
from pr1.host import Host
from pr1.reader import LocatedValue
from pr1.units.base import BaseExecutor
from pr1.ureg import ureg
from pr1.util.asyncio import wait_all
from pr1.util.pool import Pool
from quantops import Quantity, QuantityContext

from .device import (OPCUADevice, OPCUADeviceNumericNode, nodes_map,
                     variants_map)


logging.getLogger("asyncua").setLevel(logging.WARNING)


class NodeConf(Protocol):
  context: Optional[QuantityContext] # NotRequired
  description: Optional[str]
  id: str
  label: Optional[str]
  location: str
  max: Optional[Quantity] # NotRequired
  min: Optional[Quantity] # NotRequired
  resolution: Optional[Quantity] # NotRequired
  stable: bool
  type: str
  unit: Quantity # NotRequired
  writable: bool

class DeviceConf(Protocol):
  address: str
  id: str
  label: str | None
  nodes: list[NodeConf]

class Conf(Protocol):
  devices: list[DeviceConf]


class OPCUAConfigurationError(Diagnostic):
  def __init__(self, message: str, target: LocatedValue, /):
    super().__init__(
      message,
      references=[DiagnosticDocumentReference.from_value(target)]
    )


class Executor(BaseExecutor):
  options_type = am.RecordType({
    'devices': am.Attribute(am.ListType(am.RecordType({
      'address': am.StrType(),
      'id': am.IdentifierType(),
      'label': am.Attribute(am.StrType(), default=None),
      'nodes': am.ListType(am.RecordType({
        'context': am.Attribute(am.QuantityContextType(), default=None),
        'description': am.Attribute(am.StrType(), default=None),
        'id': am.StrType(),
        'label': am.Attribute(am.StrType(), default=None),
        'location': am.StrType(),
        'max': am.Attribute(am.ArbitraryQuantityType(), default=None),
        'min': am.Attribute(am.ArbitraryQuantityType(), default=None),
        'resolution': am.Attribute(am.ArbitraryQuantityType(), default=None),
        'stable': am.Attribute(am.BoolType(), default=True),
        'type': am.EnumType(*variants_map.keys()),
        'unit': am.Attribute(am.ArbitraryQuantityType(allow_unit=True), default=(1.0 * ureg.dimensionless)),
        'writable': am.Attribute(am.BoolType(), default=False)
      }))
    })), default=list())
  })

  def __init__(self, conf: Any, *, host: Host):
    self._conf = conf
    self._host = host

  def load(self, context):
    analysis = am.DiagnosticAnalysis()

    self._devices = dict[str, OPCUADevice]()

    if self._conf:
      for device_conf in self._conf.value.devices.value:
        failure = False

        if device_conf.value.id in self._host.devices:
          analysis.errors.append(OPCUAConfigurationError("Duplicate device id", device_conf.id))
          failure = True

        for node_conf in device_conf.value.nodes.value:
          if nodes_map[node_conf.value.type.value] is OPCUADeviceNumericNode:
            node_unit = node_conf.value.unit.value

            if node_conf.value.min.value is not None:
              result = analysis.add(am.QuantityType.check(node_conf.value.min, node_unit.dimensionality))
              failure = failure or isinstance(result, EllipsisType)
            elif node_conf.value.writable.value:
              analysis.errors.append(OPCUAConfigurationError(f"Missing property 'min'", node_conf))
              failure = True

            if node_conf.value.max.value is not None:
              result = analysis.add(am.QuantityType.check(node_conf.value.max, node_unit.dimensionality))
              failure = failure or isinstance(result, EllipsisType)
            elif node_conf.value.writable.value:
              analysis.errors.append(OPCUAConfigurationError(f"Missing property 'max'", node_conf))
              failure = True

            if ((ctx := node_conf.value.context.value) is not None) and (ctx.dimensionality != node_unit.dimensionality):
              analysis.errors.append(OPCUAConfigurationError(f"Invalid dimensionality", node_conf.value.context))
              failure = True

            if ((resolution := node_conf.value.resolution.value) is not None) and (resolution.dimensionality != node_unit.dimensionality):
              analysis.errors.append(OPCUAConfigurationError(f"Invalid dimensionality", node_conf.value.resolution))
              failure = True
          else:
            for key in ['context', 'min', 'max', 'resolution']:
              if getattr(node_conf.value, key).value is not None:
                analysis.errors.append(OPCUAConfigurationError(f"Invalid property '{key}' for non-numeric node", getattr(node_conf.value, key)))

        if not failure:
          device_conf_unlocated = device_conf.dislocate()

          device = OPCUADevice(
            address=device_conf_unlocated.address,
            id=device_conf_unlocated.id,
            label=device_conf_unlocated.label,
            nodes_conf=device_conf_unlocated.nodes
          )

          self._devices[device_conf_unlocated.id] = device
          self._host.devices[device_conf_unlocated.id] = device

    return analysis

  async def start(self):
    async with Pool.open() as pool:
      await wait_all([
        pool.wait_until_ready(device.start()) for device in self._devices.values()
      ])

      yield

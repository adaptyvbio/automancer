import asyncio
import logging
from typing import Any, Optional

from asyncua import Client, ua
from asyncua.common import Node as UANode
from pr1.devices.node import BaseWritableNode, BiWritableNode, BooleanWritableNode, DeviceNode, NodeUnavailableError, PolledReadableNode, ScalarWritableNode
from pr1.units.base import BaseExecutor
from pr1.util import schema as sc
from pr1.util.parser import Identifier

from . import logger, namespace


logging.getLogger("asyncua.client.client").setLevel(logging.WARNING)

variants_map = {
  'bool': ua.VariantType.Boolean,
  'i32': ua.VariantType.Int32,
  'f32': ua.VariantType.Float,
  'f64': ua.VariantType.Double
}

conf_schema = sc.Schema({
  'devices': sc.Optional(sc.List({
    'address': str,
    'label': sc.Optional(str),
    'id': Identifier(),
    'nodes': sc.Noneable(sc.List({
      'id': str,
      'label': sc.Optional(str),
      'location': str,
      'type': sc.Or(*variants_map.keys())
    }))
  }))
})


class OPCUADeviceReadableNode(PolledReadableNode):
  def __init__(self, *, device: 'OPCUADevice', id: str, label: Optional[str], node: UANode):
    super().__init__(min_interval=0.2)

    self.id = id
    self.label = label

    self._device = device
    self._node = node

  async def _read(self):
    try:
      return await self._node.read_value()
    except (ConnectionError, asyncio.TimeoutError) as e:
      await self._device._lost()
      raise NodeUnavailableError() from e


class OPCUADeviceWritableNode(BiWritableNode):
  def __init__(self, *, device: 'OPCUADevice', id: str, label: Optional[str], node: UANode, type: str):
    super().__init__()

    self.id = id
    self.label = label
    self.type = type

    self._device = device
    self._node = node
    self._variant = variants_map[type]

  async def _read(self):
    try:
      await self._node.read_value()
    except ConnectionError as e:
      await self._device._lost()
      raise NodeUnavailableError() from e
    except ua.uaerrors._auto.BadNodeIdUnknown as e: # type: ignore
      logger.error(f"Missing node {self._label}" + (f" with id '{self._node.nodeid.to_string()}'" if self._node.nodeid else str()))
      raise NodeUnavailableError() from e

  async def _write(self, value: bool):
    await self._node.write_value(ua.DataValue(value)) # type: ignore


class OPCUADeviceBooleanNode(OPCUADeviceWritableNode, BooleanWritableNode):
  def __init__(self, *, device: 'OPCUADevice', id: str, label: Optional[str], node: UANode, type: str):
    OPCUADeviceWritableNode.__init__(self, device=device, id=id, label=label, node=node, type=type)
    BooleanWritableNode.__init__(self)

class OPCUADeviceScalarNode(OPCUADeviceWritableNode, ScalarWritableNode):
  def __init__(self, *, device: 'OPCUADevice', id: str, label: Optional[str], node: UANode, type: str):
    OPCUADeviceWritableNode.__init__(self, device=device, id=id, label=label, node=node, type=type)
    ScalarWritableNode.__init__(self)


nodes_map: dict[str, type[OPCUADeviceWritableNode]] = {
  'bool': OPCUADeviceBooleanNode,
  'i32': OPCUADeviceScalarNode,
  'f32': OPCUADeviceScalarNode,
  'f64': OPCUADeviceScalarNode
}


class OPCUADevice(DeviceNode):
  model = "Generic OPC-UA device"
  owner = namespace

  def __init__(
    self,
    *,
    address: str,
    id: str,
    label: Optional[str],
    nodes_conf: Any
  ):
    super().__init__()

    self.connected = False
    self.id = id
    self.label = label

    self._address = address
    self._client = Client(address)

    self._connected = False
    self._reconnect_task = None


    def create_node(node_conf):
      Node = nodes_map[node_conf['type']]

      return Node(
        device=self,
        id=node_conf['id'].value,
        label=(node_conf['label'].value if 'label' in node_conf else None),
        node=self._client.get_node(node_conf['location'].value),
        type=node_conf['type'].value
      )

    self._keepalive_node = OPCUADeviceReadableNode(
      device=self,
      id="keepalive",
      label=None,
      node=self._client.get_node("ns=0;i=2259")
    )

    self._keepalive_reg = self._keepalive_node.watch(interval=1.0)

    self.nodes: dict[str, OPCUADeviceWritableNode] = {
      node.id: node for node in {*{create_node(node_conf) for node_conf in nodes_conf}, self._keepalive_node}
    }

  async def initialize(self):
    await self._connect()

    if not self.connected:
      logger.warning(f"Failed connecting to {self._label}")
      self._reconnect()

  async def destroy(self):
    self._keepalive_reg.cancel()

    await self._disconnect()
    await self._client.disconnect()

    if self._reconnect_task:
      self._reconnect_task.cancel()

  async def _connect(self):
    logger.debug(f"Connecting to {self._label}")

    try:
      await self._client.connect()
    # An OSError will occur if the computer is not connected to a network.
    except (ConnectionRefusedError, OSError, asyncio.TimeoutError):
      return

    logger.info(f"Configuring {self._label}")
    self._connected = True

    for node in self.nodes.values():
      await node._configure()

      if not self._connected:
        break
    else:
      self.connected = True
      logger.info(f"Connected to {self._label}")

  async def _disconnect(self):
    self.connected = False
    self._connected = False

    for node in self.nodes.values():
      if node.connected:
        await node._unconfigure()

  async def _lost(self):
    logger.warn(f"Lost connection to {self._label}")
    was_connected = self.connected

    await self._disconnect()
    await self._client.close_session()

    if was_connected:
      self._reconnect()

  def _reconnect(self, interval = 1):
    async def reconnect():
      try:
        while True:
          await self._connect()

          if self.connected:
            break

          await asyncio.sleep(interval)
      except asyncio.CancelledError:
        pass
      finally:
        self._reconnect_task = None

    self._reconnect_task = asyncio.create_task(reconnect())


class Executor(BaseExecutor):
  def __init__(self, conf, *, host):
    conf = conf_schema.transform(conf)

    self._devices = dict()
    self._host = host

    for device_conf in conf.get('devices', list()):
      device_id = device_conf['id'].value

      if device_id in self._host.devices:
        raise device_id.error(f"Duplicate device id '{device_id}'")

      device = OPCUADevice(
        address=device_conf['address'].value,
        id=device_id,
        label=(device_conf['label'].value if 'label' in device_conf else None),
        nodes_conf=device_conf['nodes']
      )

      self._devices[device_id] = device
      self._host.devices[device_id] = device

  async def initialize(self):
    for device in self._devices.values():
      await device.initialize()

  async def destroy(self):
    for device in self._devices.values():
      await device.destroy()
      del self._host.devices[device.id]

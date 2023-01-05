import asyncio
from typing import Any, Optional

from asyncua import Client, ua
from asyncua.common import Node as UANode
from pint import Quantity
from pr1.devices.node import (ConfigurableWritableNode, BooleanWritableNode, DeviceNode,
                              NodeUnavailableError, PolledReadableNode,
                              ScalarWritableNode)

from . import logger, namespace

variants_map = {
  'bool': ua.VariantType.Boolean,
  'i16': ua.VariantType.Int16,
  'i32': ua.VariantType.Int32,
  'i64': ua.VariantType.Int64,
  'u16': ua.VariantType.UInt16,
  'u32': ua.VariantType.UInt32,
  'u64': ua.VariantType.UInt64,
  'f32': ua.VariantType.Float,
  'f64': ua.VariantType.Double
}


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


class OPCUADeviceWritableNode(ConfigurableWritableNode):
  def __init__(
    self,
    *,
    description: Optional[str],
    device: 'OPCUADevice',
    id: str,
    label: Optional[str],
    node: UANode,
    type: str
  ):
    super().__init__()

    self.description = description
    self.id = id
    self.label = label

    self._device = device
    self._node = node
    self._type = type
    self._variant = variants_map[type]

  @property
  def _long_label(self):
    return f"node {self._label}" + (f" with id '{self._node.nodeid.to_string()}'" if self._node.nodeid else str())

  async def _configure(self):
    if (variant := await self._node.read_data_type_as_variant_type()) != self._variant:
      found_type = next((key for key, test_variant in variants_map.items() if test_variant == variant), 'unknown')
      logger.error(f"Type mismatch of {self._long_label}, expected {self._type}, found {found_type}")

      return

    await super()._configure()

  async def _read(self):
    try:
      return await self._node.read_value()
    except ConnectionError as e:
      await self._device._lost()
      raise NodeUnavailableError() from e
    except ua.uaerrors._auto.BadNodeIdUnknown as e: # type: ignore
      logger.error(f"Missing {self._long_label}")
      raise NodeUnavailableError() from e

  async def _write(self, raw_value: Any, /):
    match self._type:
      case 'i16' | 'i32' | 'i64' | 'u16' | 'u32' | 'u64': value = int(raw_value)
      case 'f32' | 'f64': value = float(raw_value)
      case _: value = raw_value

    await self._node.write_value(ua.DataValue(ua.Variant(value, self._variant)))


class OPCUADeviceBooleanNode(OPCUADeviceWritableNode, BooleanWritableNode):
  def __init__(self, *, description: Optional[str], device: 'OPCUADevice', id: str, label: Optional[str], node: UANode, type: str):
    OPCUADeviceWritableNode.__init__(self, description=description, device=device, id=id, label=label, node=node, type=type)
    BooleanWritableNode.__init__(self)

class OPCUADeviceScalarNode(ScalarWritableNode, OPCUADeviceWritableNode):
  def __init__(self, *, description: Optional[str], device: 'OPCUADevice', id: str, label: Optional[str], node: UANode, quantity: Optional[Quantity], type: str):
    OPCUADeviceWritableNode.__init__(self, description=description, device=device, id=id, label=label, node=node, type=type)
    ScalarWritableNode.__init__(
      self,
      dtype=("<" + type),
      factor=(quantity.magnitude if quantity is not None else 1.0),
      unit=(quantity.units if quantity is not None else None)
    )


nodes_map: dict[str, type[OPCUADeviceWritableNode]] = {
  'bool': OPCUADeviceBooleanNode,
  'i16': OPCUADeviceScalarNode,
  'i32': OPCUADeviceScalarNode,
  'i64': OPCUADeviceScalarNode,
  'u16': OPCUADeviceScalarNode,
  'u32': OPCUADeviceScalarNode,
  'u64': OPCUADeviceScalarNode,
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

      opts = dict(
        description=(node_conf['description'].value if 'description' in node_conf else None),
        device=self,
        id=node_conf['id'].value,
        label=(node_conf['label'].value if 'label' in node_conf else None),
        node=self._client.get_node(node_conf['location'].value),
        type=node_conf['type'].value
      )

      if Node == OPCUADeviceScalarNode:
        opts['quantity'] = node_conf['unit'].value if 'unit' in node_conf else None

      return Node(**opts) # type: ignore

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

    logger.debug("An error might be printed below. It can be safely discarded.")
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
      logger.info(f"Connected to {self._label}")

      self.connected = True
      self._trigger_listeners()

  async def _disconnect(self):
    self._connected = False
    self.connected = False

    for node in self.nodes.values():
      if node.connected:
        await node._unconfigure()

    self._trigger_listeners()

  async def _lost(self):
    logger.warn(f"Lost connection to {self._label}")
    was_connected = self.connected

    await self._disconnect()

    logger.debug("An error might be printed below. It can be safely discarded.")
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

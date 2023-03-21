import asyncio
import traceback
from typing import Any, Optional, cast

from asyncua import Client, ua
from asyncua.common import Node as UANode
from pint import Quantity
from pr1.devices.nodes.collection import DeviceNode
from pr1.devices.nodes.numeric import NumericReadableNode, NumericWritableNode
from pr1.devices.nodes.writable import WritableNode
from pr1.devices.nodes.common import NodeId, NodeUnavailableError
from pr1.devices.nodes.readable import PollableReadableNode, ReadableNode
from pr1.ureg import ureg
from pr1.util.batch import BatchWorker

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


class OPCUADeviceReadableNode(PollableReadableNode):
  description = None

  def __init__(
    self,
    *,
    description: Optional[str],
    device: 'OPCUADevice',
    id: NodeId,
    label: Optional[str],
    node: UANode,
    type: str
  ):
    super().__init__(min_interval=0.2)

    self.connected = False
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

  async def _read_value(self):
    try:
      if (variant := await self._node.read_data_type_as_variant_type()) != self._variant:
        found_type = next((key for key, test_variant in variants_map.items() if test_variant == variant), 'unknown')
        logger.error(f"Type mismatch of {self._long_label}, expected {self._type}, found {found_type}")

        raise NodeUnavailableError

      return await self._node.read_value()
    except ConnectionError as e:
      await self._device._lost()
      raise NodeUnavailableError from e
    except ua.uaerrors._auto.BadNodeIdUnknown as e: # type: ignore
      logger.error(f"Missing {self._long_label}")
      raise NodeUnavailableError from e

  async def _configure(self):
    await super()._configure()
    self.connected = True

  async def _unconfigure(self):
    self.connected = False
    await super()._unconfigure()


class OPCUADeviceWritableNode(OPCUADeviceReadableNode, WritableNode):
  def __init__(self, **kwargs):
    WritableNode.__init__(self)
    OPCUADeviceReadableNode.__init__(self, **kwargs)

  async def _configure(self):
    await WritableNode._configure(self)
    await OPCUADeviceReadableNode._configure(self)

  async def _unconfigure(self):
    await WritableNode._unconfigure(self)
    await OPCUADeviceReadableNode._unconfigure(self)

  async def _write(self, value, /) -> None:
    await self._device._write_worker.write((self, value))

# class OPCUADeviceBooleanNode(OPCUADeviceWritableNode, BooleanWritableNode):
#   def __init__(self, *, description: Optional[str], device: 'OPCUADevice', id: str, label: Optional[str], node: UANode, type: str):
#     OPCUADeviceWritableNode.__init__(self, description=description, device=device, id=id, label=label, node=node, type=type)
#     BooleanWritableNode.__init__(self)

class OPCUADeviceNumericReadableNode(OPCUADeviceReadableNode, NumericReadableNode):
  def __init__(self, *, dtype: str, quantity: Optional[Quantity], **kwargs):
    OPCUADeviceReadableNode.__init__(self, **kwargs)
    NumericReadableNode.__init__(
      self,
      dtype=dtype,
      factor=(quantity.magnitude if quantity is not None else 1.0),
      unit=(quantity.units if quantity is not None else None)
    )

class OPCUADeviceNumericWritableNode(OPCUADeviceWritableNode, NumericReadableNode, NumericWritableNode):
  def __init__(
    self,
    *,
    dtype: str,
    max: Optional[Quantity],
    min: Optional[Quantity],
    quantity: Optional[Quantity],
    **kwargs
  ):
    OPCUADeviceWritableNode.__init__(self, **kwargs)
    NumericWritableNode.__init__(
      self,
      dtype=dtype,
      max=max,
      min=min,
      factor=(quantity.magnitude if quantity is not None else 1.0),
      unit=(quantity.units if quantity is not None else None)
    )

print(OPCUADeviceNumericWritableNode.mro())

dtype_map: dict[str, str] = {
  'i16': 'i2',
  'i32': 'i4',
  'i64': 'i8',
  'u16': 'u2',
  'u32': 'u4',
  'u64': 'u8',
  'f32': 'f4',
  'f64': 'f8'
}

nodes_map: dict[str, tuple[type[OPCUADeviceReadableNode], type[OPCUADeviceWritableNode]]] = {
  # 'bool': OPCUADeviceBooleanNode,
  'i16': (OPCUADeviceNumericReadableNode, OPCUADeviceNumericWritableNode),
  'i32': (OPCUADeviceNumericReadableNode, OPCUADeviceNumericWritableNode),
  'i64': (OPCUADeviceNumericReadableNode, OPCUADeviceNumericWritableNode),
  'u16': (OPCUADeviceNumericReadableNode, OPCUADeviceNumericWritableNode),
  'u32': (OPCUADeviceNumericReadableNode, OPCUADeviceNumericWritableNode),
  'u64': (OPCUADeviceNumericReadableNode, OPCUADeviceNumericWritableNode),
  'f32': (OPCUADeviceNumericReadableNode, OPCUADeviceNumericWritableNode),
  'f64': (OPCUADeviceNumericReadableNode, OPCUADeviceNumericWritableNode)
}


class OPCUADevice(DeviceNode):
  description = None
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
    self.id = NodeId(id)
    self.label = label

    self._address = address
    self._client = Client(address)

    self._connected = False
    self._reconnect_task: Optional[asyncio.Task[None]] = None

    self._read_worker = BatchWorker[OPCUADeviceReadableNode | OPCUADeviceWritableNode, Any](self._commit_read)
    self._write_worker = BatchWorker[tuple[OPCUADeviceWritableNode, Any], None](self._commit_write)


    def create_node(node_conf):
      ReadableNode, WritableNode = nodes_map[node_conf['type']]

      opts: dict[str, Any] = dict(
        description=(node_conf['description'].value if 'description' in node_conf else None),
        device=self,
        id=node_conf['id'].value,
        label=(node_conf['label'].value if 'label' in node_conf else None),
        node=self._client.get_node(node_conf['location'].value),
        type=node_conf['type'].value
      )

      dtype = dtype_map.get(node_conf['type'].value)
      writable = (writable_conf := node_conf.get('writable')) and writable_conf.value

      if dtype is not None:
        opts |= dict(
          dtype= dtype,
          quantity=(node_conf['unit'].value if 'unit' in node_conf else None)
        )

        if writable:
          opts |= dict(
            max=None,
            min=None
          )

      return WritableNode(**opts) if writable else ReadableNode(**opts)

    # self._keepalive_node = OPCUADeviceReadableNode(
    #   device=self,
    #   id="keepalive",
    #   label=None,
    #   node=self._client.get_node("ns=0;i=2259")
    # )

    self.nodes: dict[NodeId, OPCUADeviceReadableNode] = {
      # node.id: node for node in {*{create_node(node_conf) for node_conf in nodes_conf}, self._keepalive_node}
      node.id: node for node in {*{create_node(node_conf) for node_conf in nodes_conf}}
    }

  async def initialize(self):
    await self._connect()

    if not self.connected:
      logger.warning(f"Failed connecting to {self._label}")
      self._reconnect()

    # x = cast(OPCUADeviceReadableNode, self.nodes['S01'])
    # reg = await x.watch_value(lambda _: print('change'))

    # self._keepalive_reg = await self._keepalive_node.watch_value(lambda node: None)

    r = self.nodes[NodeId('S01')]
    w = cast(OPCUADeviceNumericWritableNode, self.nodes[NodeId('S02')])

    await asyncio.gather(
      r.read(),
      w.read()
    )

    # def listener(node):
    #   print("Change", node.value)

    # reg = await x.watch_value(listener)
    # print('Ready', x.value)

    # await asyncio.sleep(2)
    # await reg.cancel()

    # await x.write_quantity(2 * ureg.km)

  async def destroy(self):
    # await self._keepalive_reg.cancel()
    await self._disconnect()

    logger.debug("An error might be printed below. It can be safely discarded.")
    await self._client.disconnect()

    if self._reconnect_task:
      self._reconnect_task.cancel()

      try:
        await self._reconnect_task
      except asyncio.CancelledError:
        pass

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

    self.connected = True

    logger.info(f"Connected to {self._label}")

  async def _disconnect(self):
    self._connected = False
    self.connected = False

    for node in self.nodes.values():
      await node._unconfigure()

  async def _lost(self):
    if self._connected:
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
      except Exception:
        traceback.print_exc()
      finally:
        self._reconnect_task = None

    self._reconnect_task = asyncio.create_task(reconnect())

  async def _commit_read(self, items: list[OPCUADeviceReadableNode | OPCUADeviceWritableNode], /):
    return await self._client.read_values([node._node for node in items])

  async def _commit_write(self, items: list[tuple[OPCUADeviceWritableNode, Any]], /):
    uanodes = [node._node for node, _ in items]
    values: list[Any] = [None] * len(items)

    for index, (node, value) in enumerate(items):
      match node._type:
        case 'i16' | 'i32' | 'i64' | 'u16' | 'u32' | 'u64': value = int(value)
        case 'f32' | 'f64': value = float(value)

      values[index] = ua.DataValue(ua.Variant(value, node._variant))

    await self._client.write_values(uanodes, values)

    return [None] * len(items)

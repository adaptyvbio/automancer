import asyncio
import traceback
from asyncio import Event, Future
from typing import Any, Optional, cast

from asyncua import Client, ua
from asyncua.common import Node as UANode
from asyncua.ua.uatypes import NodeId as UANodeId
from pint import Quantity
from pr1.devices.nodes.collection import DeviceNode
from pr1.devices.nodes.numeric import NumericNode
from pr1.devices.nodes.common import NodeId, NodeUnavailableError
from pr1.devices.nodes.readable import PollableReadableNode
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


class OPCUADeviceNode(PollableReadableNode):
  def __init__(
    self,
    *,
    description: Optional[str],
    device: 'OPCUADevice',
    id: NodeId,
    label: Optional[str],
    location: UANodeId,
    type: str,
    **kwargs
  ):
    super().__init__(min_interval=0.2, readable=True, **kwargs)

    self.connected = False
    self.description = description
    self.id = id
    self.label = label

    self._device = device
    self._location = location
    self._type = type
    self._variant = variants_map[type]

  @property
  def _long_label(self):
    return f"node {self._label} with id '{self._location.to_string()}'"

  async def _read_value(self):
    try:
      return await self._device._read_worker.write(self)
    except ConnectionError as e:
      raise NodeUnavailableError from e

  # TODO: Add _subscribe()

  async def _configure(self):
    await super()._configure()

    assert self._device._client
    node = self._device._client.get_node(self._location)

    try:
      if (variant := await node.read_data_type_as_variant_type()) != self._variant:
        found_type = next((key for key, test_variant in variants_map.items() if test_variant == variant), 'unknown')
        logger.error(f"Type mismatch of {self._long_label}, expected {self._type}, found {found_type}")

        raise NodeUnavailableError
    except ConnectionError as e:
      raise NodeUnavailableError from e
    except ua.uaerrors._auto.BadNodeIdUnknown as e: # type: ignore
      logger.error(f"Missing {self._long_label}")
      raise NodeUnavailableError from e

  async def _unconfigure(self):
    await super()._unconfigure()

  async def _write(self, value, /) -> None:
    try:
      await self._device._write_worker.write((self, value))
    except ConnectionError as e:
      raise NodeUnavailableError from e

class OPCUADeviceNumericNode(OPCUADeviceNode, NumericNode):
  def __init__(
    self,
    *,
    dtype: str,
    max: Optional[Quantity] = None,
    min: Optional[Quantity] = None,
    quantity: Optional[Quantity],
    **kwargs
  ):
    super().__init__(
      dtype=dtype,
      max=max,
      min=min,
      factor=(quantity.magnitude if quantity is not None else 1.0),
      unit=(quantity.units if quantity is not None else None),
      **kwargs
    )


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

nodes_map: dict[str, type[OPCUADeviceNode]] = {
  # 'bool': OPCUADeviceBooleanNode,
  'i16': OPCUADeviceNumericNode,
  'i32': OPCUADeviceNumericNode,
  'i64': OPCUADeviceNumericNode,
  'u16': OPCUADeviceNumericNode,
  'u32': OPCUADeviceNumericNode,
  'u64': OPCUADeviceNumericNode,
  'f32': OPCUADeviceNumericNode,
  'f64': OPCUADeviceNumericNode
}


class BaseUANodeSubHandler:
  def datachange_notification(self, node: UANode, val, data):
    pass

  def event_notification(self, event: ua.EventNotificationList):
    pass

  def status_change_notification(self, status: ua.StatusChangeNotification):
    pass


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
    self._client: Optional[Client] = None

    self._connected = False
    self._task: Optional[asyncio.Task[None]] = None

    self._read_worker = BatchWorker[OPCUADeviceNode, Any](self._commit_read)
    self._write_worker = BatchWorker[tuple[OPCUADeviceNode, Any], None](self._commit_write)

    self.nodes: dict[NodeId, OPCUADeviceNode] = {
      (node := self._create_node(node_conf)).id: node for node_conf in nodes_conf
    }

  def _create_node(self, node_conf):
    Node = nodes_map[node_conf['type']]

    opts: dict[str, Any] = dict(
      description=(node_conf['description'].value if 'description' in node_conf else None),
      device=self,
      id=node_conf['id'].value,
      label=(node_conf['label'].value if 'label' in node_conf else None),
      location=UANodeId.from_string(node_conf['location'].value),
      type=node_conf['type'].value
    )

    dtype = dtype_map.get(node_conf['type'].value)
    writable = (writable_conf := node_conf.get('writable')) and writable_conf.value

    if dtype is not None:
      opts |= dict(
        dtype=dtype,
        quantity=(node_conf['unit'].value if 'unit' in node_conf else None)
      )

      if writable:
        opts |= dict(
          max=None,
          min=None,
          writable=True
        )

    return Node(**opts)

  async def initialize(self):
    ready_event = Event()
    self._task = asyncio.create_task(self._connect(ready_event))

    await ready_event.wait()

    if not self.connected:
      logger.warning(f"Failed connecting to {self._label}")

    # r = cast(OPCUADeviceNumericReadableNode, self.nodes[NodeId('S01')])
    # w = cast(OPCUADeviceNumericWritableNode, self.nodes[NodeId('S02')])

    # await asyncio.gather(
    #   r.read(),
    #   w.read()
    # )

    # print(r.value, w.value)

    # def listener(node):
    #   print("Change", node.value)

    # reg = await r.watch_value(listener)
    # print('Ready', r.value)

    # await asyncio.sleep(2)
    # await reg.cancel()

    # await x.write_quantity(2 * ureg.km)

  async def destroy(self):
    if self._task:
      self._task.cancel()

      try:
        await self._task
      except asyncio.CancelledError:
        pass

      self._task = None

  async def _connect(self, ready_event: Event):
    logger.debug(f"Connecting to {self._label}")

    keepalive_handler = BaseUANodeSubHandler()

    try:
      while True:
        self._client = Client(self._address)

        try:
          async with self._client:
            logger.info(f"Configuring {self._label}")
            self._connected = True

            for node in self.nodes.values():
              try:
                await node._configure()
              except NodeUnavailableError:
                pass

              node.connected = True

            self.connected = True

            logger.info(f"Connected to {self._label}")
            ready_event.set()

            subscription = await self._client.create_subscription(500, keepalive_handler)
            node = (self._client.get_node(ua.ObjectIds.Server_ServerStatus_CurrentTime), )

            await subscription.subscribe_data_change(node)

            while True:
              await asyncio.sleep(1)
              await self._client.check_connection()
        except (ConnectionError, ConnectionRefusedError, OSError, asyncio.TimeoutError):
          if self.connected:
            logger.error(f"Lost connection to {self._label}")
        finally:
          ready_event.set()
          self._client = None

          if self._connected:
            self._connected = False
            self.connected = False

            for node in self.nodes.values():
              node.connected = False
              await node._unconfigure()

        await asyncio.sleep(1.0)
    except Exception:
      traceback.print_exc()
    finally:
      self._task = None

  async def _commit_read(self, items: list[OPCUADeviceNode], /):
    assert self._client
    return await self._client.read_values([self._client.get_node(node._location) for node in items])

  async def _commit_write(self, items: list[tuple[OPCUADeviceNode, Any]], /):
    assert self._client

    uanodes = [self._client.get_node(node._location) for node, _ in items]
    values: list[Any] = [None] * len(items)

    for index, (node, value) in enumerate(items):
      match node._type:
        case 'i16' | 'i32' | 'i64' | 'u16' | 'u32' | 'u64': value = int(value)
        case 'f32' | 'f64': value = float(value)

      values[index] = ua.DataValue(ua.Variant(value, node._variant))

    await self._client.write_values(uanodes, values)

    return [None] * len(items)

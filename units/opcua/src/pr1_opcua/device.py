import asyncio
import time
from asyncio import Event
from contextlib import AsyncExitStack
from typing import TYPE_CHECKING, Any, Callable, Optional, cast, final

from asyncua import Client, ua
from asyncua.common import Node as UANode
from asyncua.common.subscription import SubHandler
from asyncua.ua.uaerrors import BadNodeIdUnknown, UaStatusCodeError
from asyncua.ua.uatypes import NodeId as UANodeId
from pr1.devices.nodes.collection import DeviceNode
from pr1.devices.nodes.common import NodeId, NodeUnavailableError
from pr1.devices.nodes.numeric import NumericNode
from pr1.devices.nodes.primitive import BooleanNode
from pr1.devices.nodes.readable import SubscribableReadableNode
from pr1.util.asyncio import aexit_handler, race, shield, wait_all
from pr1.util.batch import BatchWorker
from pr1.util.pool import Pool
from quantops import Quantity

from . import logger, namespace

if TYPE_CHECKING:
  from .executor import NodeConf


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


AsyncUaError = (OSError, asyncio.TimeoutError, UaStatusCodeError)

class OPCUADeviceNode(SubscribableReadableNode):
  def __init__(
    self,
    *,
    description: Optional[str],
    device: 'OPCUADevice',
    id: NodeId,
    label: Optional[str],
    location: UANodeId,
    stable: bool,
    type: str,
    **kwargs
  ):
    super().__init__(readable=True, **kwargs)

    self.description = description
    self.id = id
    self.label = label

    self._device = device
    self._location = location
    self._stable = stable
    self._type = type
    self._variant = variants_map[type]

    self._node: UANode

  @property
  def _long_label(self):
    return f"node {self._label} with id '{self._location.to_string()}'"

  async def __aenter__(self):
    assert self._device._client
    self._node = self._device._client.get_node(self._location)

    try:
      if (variant := await self._node.read_data_type_as_variant_type()) != self._variant:
        found_type = next((key for key, test_variant in variants_map.items() if test_variant == variant), 'unknown')
        logger.error(f"Type mismatch of {self._long_label}, expected {self._type}, found {found_type}")

        raise NodeUnavailableError
    except BadNodeIdUnknown as e:
      logger.error(f"Missing {self._long_label}")
      raise NodeUnavailableError from e
    except AsyncUaError as e:
      raise NodeUnavailableError from e
    else:
      self.connected = True

  @aexit_handler
  async def __aexit__(self):
    self.connected = False
    del self._node

  async def _subscribe(self):
    assert self._device._client

    # If the node is stable, we can just read it once and every time it reconnects.
    if self._stable:
      await self.read()
      yield

      await self.wait_disconnected()
      raise NodeUnavailableError

    # Otherwise, we need to subscribe to it and wait for changes.
    else:
      ready_event = Event()

      try:
        subscription = await self._device._client.create_subscription(500, OPCUADeviceNodeSubHandler(self, ready_event))
        await subscription.subscribe_data_change(self._node)
      except AsyncUaError as e:
        raise NodeUnavailableError from e

      try:
        await race(
          ready_event.wait(),
          self.wait_disconnected()
        )

        if not self.connected:
          raise NodeUnavailableError

        yield

        await self.wait_disconnected()
        raise NodeUnavailableError
      finally:
        # Check the the connection was not lost otherwise subscription.delete() never returns
        if self.connected:
          await shield(race(
            subscription.delete(),
            self.wait_disconnected()
          ))

  async def _read(self):
    async def read():
      return self._transform_read(await self._device._read_worker.write(self))

    try:
      await self._set_value_at_half_time(read())
    except AsyncUaError as e:
      raise NodeUnavailableError from e

  async def _write(self, value, /) -> None:
    try:
      await self._device._write_worker.write((self, self._transform_write(value)))
    except AsyncUaError as e:
      raise NodeUnavailableError from e

  def _transform_read(self, value: Any, /) -> Any:
    return value

  def _transform_write(self, value: Any, /) -> Any:
    return value

class OPCUADeviceNodeSubHandler(SubHandler):
  def __init__(self, opcua_node: OPCUADeviceNode, ready_event: Event):
    self._opcua_node = opcua_node
    self._ready_event = ready_event

  def datachange_notification(self, node: UANode, val, data):
    # The 'is' operator doesn't work here.
    # The timestamp will be None if the value was changed by a write.
    if node == self._opcua_node._node and (change_datetime := data.monitored_item.Value.SourceTimestamp):
      self._opcua_node.value = (change_datetime.timestamp(), self._opcua_node._transform_read(val))
      self._opcua_node._trigger_listeners(mode='value')
      self._ready_event.set()


@final
class OPCUADeviceBooleanNode(OPCUADeviceNode, BooleanNode):
  def __init__(self, **kwargs):
    super().__init__(**kwargs)
    self.icon = "toggle_on"

@final
class OPCUADeviceNumericNode(OPCUADeviceNode, NumericNode):
  def __init__(
    self,
    *,
    quantity: Quantity,
    **kwargs
  ):
    super().__init__(
      **kwargs
    )

    self.icon = "speed"
    self._quantity = quantity

  def _transform_read(self, value: float, /):
    return value * self._quantity

  def _transform_write(self, value: Quantity, /):
    raw_value = (value / self._quantity).magnitude

    match self._type:
      case 'i16' | 'i32' | 'i64' | 'u16' | 'u32' | 'u64':
        raw_value = int(raw_value)
      case 'f32' | 'f64':
        raw_value = float(raw_value)

    return raw_value


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
  'bool': OPCUADeviceBooleanNode,
  'i16': OPCUADeviceNumericNode,
  'i32': OPCUADeviceNumericNode,
  'i64': OPCUADeviceNumericNode,
  'u16': OPCUADeviceNumericNode,
  'u32': OPCUADeviceNumericNode,
  'u64': OPCUADeviceNumericNode,
  'f32': OPCUADeviceNumericNode,
  'f64': OPCUADeviceNumericNode
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
    self._client: Optional[Client] = None
    self._task: Optional[asyncio.Task[None]] = None

    self._read_worker = BatchWorker[OPCUADeviceNode, Any](self._commit_read)
    self._write_worker = BatchWorker[tuple[OPCUADeviceNode, Any], None](self._commit_write)

    self.nodes: dict[NodeId, OPCUADeviceNode] = {
      (node := self._create_node(node_conf)).id: node for node_conf in nodes_conf
    }

  def _create_node(self, node_conf: 'NodeConf'):
    Node = nodes_map[node_conf.type]

    opts: dict[str, Any] = dict(
      context=(node_conf.context or node_conf.unit.find_context()),
      description=node_conf.description,
      device=self,
      id=node_conf.id,
      label=node_conf.label,
      location=UANodeId.from_string(node_conf.location),
      resolution=node_conf.resolution,
      stable=node_conf.stable,
      type=node_conf.type,
      writable=node_conf.writable
    )

    dtype = dtype_map.get(node_conf.type)

    if dtype is not None:
      opts |= dict(
        dtype=dtype,
        quantity=node_conf.unit,
        range=((node_conf.min, node_conf.max) if node_conf.min and node_conf.max else None)
      )

    return Node(**opts)

  async def start(self):
    async with Pool.open() as pool:
      for node in self.nodes.values():
        pool.start_soon(node.start(), priority=1)

      await pool.wait_until_ready(self._connect())

      if not self.connected:
        logger.warning(f"Failed connecting to {self._label}")

      yield

  async def _connect(self):
    logger.debug(f"Connecting to {self._label}")

    keepalive_handler = SubHandler()
    ready = False

    try:
      while True:
        self._client = Client(self._address)

        try:
          async with self._client:
            logger.info(f"Configuring {self._label}")
            self.connected = True

            async with AsyncExitStack() as stack:
              try:
                await wait_all([stack.enter_async_context(node) for node in self.nodes.values()])
              except* NodeUnavailableError:
                pass

              if not ready:
                yield
                ready = True

              subscription = await self._client.create_subscription(500, keepalive_handler)
              node = (self._client.get_node(ua.ObjectIds.Server_ServerStatus_CurrentTime), ) # type: ignore

              await subscription.subscribe_data_change(node)

              while True:
                await asyncio.sleep(1)
                await self._client.check_connection()
        except AsyncUaError:
          if self.connected:
            logger.error(f"Lost connection to {self._label}")
        finally:
          if not ready:
            yield
            ready = True

          self._client = None
          self.connected = False

        await asyncio.sleep(1.0)
    finally:
      self._task = None

  async def _commit_read(self, items: list[OPCUADeviceNode], /):
    assert self._client
    return await self._client.read_values([self._client.get_node(node._location) for node in items])

  async def _commit_write(self, items: list[tuple[OPCUADeviceNode, Any]], /):
    assert self._client

    uanodes = [self._client.get_node(node._location) for node, _ in items]
    values = [ua.DataValue(ua.Variant(value, node._variant)) for node, value in items]

    await self._client.write_values(uanodes, values)

    return [None] * len(items)

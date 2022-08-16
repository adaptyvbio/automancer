import asyncio
from asyncua import Client, ua
from pr1.util import schema as sc
from pr1.units.base import BaseExecutor

from . import logger, namespace


variants_map = {
  'bool': ua.VariantType.Boolean,
  'i32': ua.VariantType.Int32,
  'f32': ua.VariantType.Float,
  'f64': ua.VariantType.Double
}

conf_schema = sc.Schema({
  'devices': sc.List({
    'address': str,
    'label': sc.Optional(str),
    'id': str,
    'nodes': sc.Noneable(sc.List({
      'id': str,
      'name': str,
      'type': sc.Or(*variants_map.keys())
    }))
  })
})


class HostDevice:
  label = None
  model = "Generic OPC-UA device"
  owner = namespace

  def __init__(self, node_names, nodes):
    self._nodes = nodes
    self._node_names = node_names

  async def read(self, node_index):
    return await self._nodes[node_index].read()

  async def write(self, node_index, value):
    await self._nodes[node_index].write(value)


class HostDeviceNode:
  def __init__(self):
    self.connected = True

  #   self._claimant_index = None

  # def claim(self, claimant_index):
  #   self._claimant_index = claimant_index

  async def read(self):
    raise NotImplementedError

  async def write(self, value):
    raise NotImplementedError


class DeviceNode(HostDeviceNode):
  def __init__(self, node, type):
    super().__init__()

    self._node = node
    self._type = type
    self._variant = variants_map[type]

    self.connected = False

  async def _connect(self):
    try:
      await self._node.get_value()
    except ua.uaerrors._auto.BadNodeIdUnknown:
      logger.error(f"Missing node '{self._node.nodeid}'")
    else:
      self.connected = True

  async def read(self):
    return await self._node.read_value()

  async def write(self, value):
    if self.connected:
      await self._node.write_value(ua.Variant([value], self._variant))


class Device:
  def __init__(self, id, address, nodes_conf):
    self._address = address
    self._client = Client(address)
    self._id = id

    self._host_device = HostDevice(
      node_names={node['name']: node_index for node_index, node in enumerate(nodes_conf)},
      nodes=[
        DeviceNode(
          node=self._client.get_node(node_conf['id'].value),
          type=node_conf['type']
        ) for node_conf in nodes_conf
      ]
    )

    self._check_task = None
    self._reconnect_task = None
    self.connected = False

  async def initialize(self):
    await self._connect()

    if not self.connected:
      logger.error(f"Failed connecting to '{self._address}'")
      self._reconnect()

  async def destroy(self):
    if self.connected:
      await self._client.disconnect()

    if self._check_task:
      self._check_task.cancel()

    if self._reconnect_task:
      self._reconnect_task.cancel()


  async def _connect(self):
    logger.debug(f"Connecting to '{self._address}'")

    try:
      await self._client.connect()
    except (ConnectionRefusedError, asyncio.exceptions.TimeoutError):
      return

    logger.info(f"Connected to '{self._address}'")
    self.connected = True

    for node in self._host_device._nodes:
      await node._connect()

    server_state_node = self._client.get_node("ns=0;i=2259")

    async def check_loop():
      try:
        while True:
          await server_state_node.get_value()
          await asyncio.sleep(1)
      except ConnectionError:
        logger.error(f"Lost connection to '{self._address}'")

        self.connected = False
        self._reconnect()
      except asyncio.CancelledError:
        self._check_task = None

    self._check_task = asyncio.create_task(check_loop())


  def _reconnect(self, interval = 1):
    async def reconnect():
      try:
        while True:
          await self._connect()

          if self.connected:
            return

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

    for device_conf in conf['devices']:
      device_id = device_conf['id']

      if device_id in self._host.devices:
        raise device_id.error(f"Duplicate device id '{device_id}'")

      device = Device(
        address=device_conf['address'],
        id=device_id,
        # label=device_conf.get('label'),
        nodes_conf=device_conf['nodes']
      )

      self._devices[device_id] = device
      self._host.devices[device_id] = device._host_device

  async def initialize(self):
    for device in self._devices.values():
      await device.initialize()
      # await device._host_device.read(0)

  async def destroy(self):
    for device in self._devices.values():
      await device.destroy()
      del self._host.devices[device._id]

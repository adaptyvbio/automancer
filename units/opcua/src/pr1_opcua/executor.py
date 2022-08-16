import asyncio
from asyncua import Client, ua
from collections import namedtuple
from pr1.util import schema as sc
from pr1.units.base import BaseExecutor

from . import logger


variants_map = {
  'bool': ua.VariantType.Boolean,
  'i32': ua.VariantType.Int32,
  'f32': ua.VariantType.Float,
  'f64': ua.VariantType.Double
}

conf_schema = sc.Schema({
  'devices': sc.List({
    'address': str,
    'name': str,
    'nodes': sc.Noneable(sc.List({
      'id': str,
      'name': str,
      'type': sc.Or(*variants_map.keys())
    }))
  })
})


class HostDevice:
  def __init__(self, node_names, nodes):
    # self._claimants = list()
    self._nodes = nodes
    self._node_names = node_names

  async def read(self, node_index):
    return await self._nodes[node_index].read()

  async def write(self, node_index, value):
    await self._nodes[node_index].write(value)

  # def get_adapter(self, name):
  #   try:
  #     claimant_index = self._claimants.index(name)
  #   except ValueError:
  #     claimant_index = len(self._claimants)
  #     self._claimants.append(name)

  #   return HostDeviceAdapter(device=self, claimant_index=claimant_index)


# class HostDeviceAdapter:
#   def __init__(self, device, claimant_index):
#     self._claimant_index = claimant_index
#     self._device = device

#   def claim(self, mask = None):
#     for node_index, node in enumerate(self._nodes):
#       if (mask is None) or (mask & (1 << node_index)) > 0:
#         node.claim()

#   def get_node_index(self, name):
#     return self._device._node_names.get(name)

  # def set_node_value(self, index, value):
    # node =

    # self._claimant_index =

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
  def __init__(self, address, nodes_conf):
    self._address = address
    self._client = Client(address)

    self._host_device = HostDevice(
      node_names={node['name']: node_index for node_index, node in enumerate(nodes_conf)},
      nodes=[
        DeviceNode(
          node=self._client.get_node(node_conf['id'].value),
          type=node_conf['type']
        ) for node_conf in nodes_conf
      ]
    )

    self.connected = False

  async def initialize(self):
    try:
      await self._client.connect()
    except (ConnectionRefusedError, asyncio.exceptions.TimeoutError):
      logger.error(f"Connection to '{self._address}' failed")
      return

    logger.info(f"Connected to '{self._address}'")
    self.connected = True

    for node in self._host_device._nodes:
      await node._connect()

    server_state_node = self._client.get_node("ns=0;i=2259")

    async def check_loop():
      while True:
        try:
          await server_state_node.get_value()
        except ConnectionError:
          logger.error(f"Connection to '{self._address}' lost")
          self.connected = False
          return

        await asyncio.sleep(1)

    loop = asyncio.get_event_loop()
    loop.create_task(check_loop())

  async def destroy(self):
    if self.connected:
      await self._client.disconnect()


class Executor(BaseExecutor):
  def __init__(self, conf, *, host):
    conf = conf_schema.transform(conf)

    self._devices = dict()

    for device_conf in conf['devices']:
      device_name = device_conf['name']

      if device_name in host.devices:
        raise device_name.error(f"Duplicate device name '{device_name}'")

      device = Device(address=device_conf['address'], nodes_conf=device_conf['nodes'])

      self._devices[device_name] = device
      host.devices[device_name] = device._host_device

  async def initialize(self):
    for device in self._devices.values():
      await device.initialize()
      # await device._host_device.read(0)

  async def destroy(self):
    for device in self._devices.values():
      await device.destroy()

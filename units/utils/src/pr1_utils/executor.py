import asyncio
from typing import Any

import psutil
from pr1.devices.node import ConfigurableNode, DeviceNode, PolledReadableNode, ScalarReadableNode, SubscribableReadableNode
from pr1.host import Host
from pr1.units.base import BaseExecutor
from pr1.ureg import ureg

from . import namespace


class SystemNode(DeviceNode):
  connected = True
  description = None
  id = "System"
  label = "System device"
  model = "System"
  owner = namespace

  def __init__(self):
    super().__init__()

    self.nodes: dict[str, ConfigurableNode] = { node.id: node for node in {ProcessMemoryUsageNode()} }

class ProcessMemoryUsageNode(SubscribableReadableNode[ureg.Quantity], ScalarReadableNode):
  description = None
  id = 'memory'
  label = "Process memory usage"

  def __init__(self):
    SubscribableReadableNode.__init__(self)
    ScalarReadableNode.__init__(self, dtype='<u4', unit=ureg.byte)

    self._process = psutil.Process()

  async def _subscribe(self):
    while True:
      memory_info = self._process.memory_info()
      yield memory_info.rss * ureg.byte
      await asyncio.sleep(0.3)

class Executor(BaseExecutor):
  def __init__(self, conf: Any, *, host: Host):
    self._device = SystemNode()
    host.devices[self._device.id] = self._device

  async def initialize(self):
    for node in self._device.nodes.values():
      await node._configure()

  async def destroy(self):
    for node in self._device.nodes.values():
      await node._unconfigure()

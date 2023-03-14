import asyncio
import time
from pint import Quantity
from typing import Any

import psutil
from pr1.devices.node import BaseConfigurableNode, DeviceNode, PolledReadableNode, QuantityReadableNode, SubscribableReadableNode
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

    self.nodes: dict[str, BaseConfigurableNode] = {
      node.id: node for node in {
        EpochNode(),
        ProcessMemoryUsageNode()
      }
    }

class ProcessMemoryUsageNode(PolledReadableNode, QuantityReadableNode):
  id = 'memory'
  label = "Process memory usage"

  def __init__(self):
    PolledReadableNode.__init__(self, min_interval=0.3)
    QuantityReadableNode.__init__(self, dtype='u4', unit=ureg.byte)

    self._process = psutil.Process()

  async def _read_quantity(self):
    memory_info = self._process.memory_info()
    return memory_info.rss * ureg.byte

class EpochNode(PolledReadableNode, QuantityReadableNode):
  id = 'epoch'
  label = "Unix epoch"

  def __init__(self):
    PolledReadableNode.__init__(self, min_interval=0.3)
    QuantityReadableNode.__init__(self, dtype='u8', unit=ureg.sec)

  async def _read_quantity(self):
    return time.time() * ureg.sec


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

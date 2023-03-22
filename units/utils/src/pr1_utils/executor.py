import asyncio
import time
from typing import Any

import psutil
from pint import Quantity
from pr1.devices.nodes.collection import DeviceNode
from pr1.devices.nodes.common import ConfigurableNode, NodeId
from pr1.devices.nodes.numeric import NumericReadableNode
from pr1.devices.nodes.readable import PollableReadableNode
from pr1.units.base import BaseExecutor
from pr1.ureg import ureg

from pr1.host import Host

from . import namespace


class SystemNode(DeviceNode):
  connected = True
  description = None
  id = NodeId("System")
  label = "System device"
  model = "System"
  owner = namespace

  def __init__(self):
    super().__init__()

    self.nodes: dict[str, ConfigurableNode] = {
      node.id: node for node in {
        EpochNode(),
        ProcessMemoryUsageNode()
      }
    }

class ProcessMemoryUsageNode(PollableReadableNode, NumericReadableNode):
  connected = True
  id = NodeId('memory')
  label = "Process memory usage"

  def __init__(self):
    PollableReadableNode.__init__(self, min_interval=0.3)
    NumericReadableNode.__init__(self, dtype='u4', unit=ureg.byte)

    self._process = psutil.Process()

  async def _read_value(self):
    memory_info = self._process.memory_info()
    return memory_info.rss * ureg.byte

class EpochNode(PollableReadableNode, NumericReadableNode):
  connected = True
  id = NodeId('epoch')
  label = "Unix epoch"

  def __init__(self):
    PollableReadableNode.__init__(self, min_interval=0.3)
    NumericReadableNode.__init__(self, dtype='u1', unit=ureg.sec)

  async def _read_value(self):
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

import random
import time
from typing import Any

import psutil
from pr1.devices.nodes.collection import DeviceNode
from pr1.devices.nodes.common import ConfigurableNode, NodeId
from pr1.devices.nodes.numeric import NumericNode
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
        ProcessMemoryUsageNode(),
        RandomNode()
      }
    }

class ProcessMemoryUsageNode(PollableReadableNode, NumericNode):
  def __init__(self):
    super().__init__(
      readable=True,
      dtype='u4',
      min_interval=0.3,
      unit=ureg.byte
    )

    self.connected = True
    self.id = NodeId('memory')
    self.label = "Process memory usage"

    self._process = psutil.Process()

  async def _read_value(self):
    memory_info = self._process.memory_info()
    return memory_info.rss * ureg.byte

class EpochNode(PollableReadableNode, NumericNode):
  def __init__(self):
    super().__init__(
      readable=True,
      dtype='u8',
      min_interval=0.3,
      unit=ureg.sec
    )

    self.connected = True
    self.id = NodeId('epoch')
    self.label = "Unix epoch"

  async def _read_value(self):
    return time.time() * ureg.sec

class RandomNode(PollableReadableNode, NumericNode):
  def __init__(self):
    super().__init__(
      readable=True,
      dtype='f4',
      min_interval=0.2
    )

    self.connected = True
    self.id = NodeId('random')
    self.label = "Random"

  async def _read_value(self):
    return random.random()


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

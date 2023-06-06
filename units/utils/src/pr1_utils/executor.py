import asyncio
import random
import time
from typing import Any

import psutil
from pr1.devices.nodes.collection import DeviceNode
from pr1.devices.nodes.common import NodeId
from pr1.devices.nodes.numeric import NumericNode
from pr1.devices.nodes.readable import PollableReadableNode
from pr1.devices.nodes.value import NullType, ValueNode
from pr1.units.base import BaseExecutor
from pr1.ureg import ureg

from pr1.host import Host
from pr1.util.pool import Pool

from . import namespace


class SystemNode(DeviceNode):
  owner = namespace

  def __init__(self):
    super().__init__()

    self.connected = True
    self.icon = "storage"
    self.id = NodeId("System")
    self.label = "System device"

    self.nodes: dict[NodeId, ValueNode] = {
      node.id: node for node in {
        EpochNode(),
        ProcessMemoryUsageNode(),
        RandomNode()
      }
    }

  async def start(self):
    async with Pool.open() as pool:
      for node in self.nodes.values():
        pool.start_soon(node.start())


class ProcessMemoryUsageNode(NumericNode, PollableReadableNode):
  def __init__(self):
    super().__init__(
      context="memory",
      dtype='u4',
      poll_interval=0.3,
      readable=True
    )

    self.connected = True
    self.icon = "memory_alt"
    self.id = NodeId('memory')
    self.label = "Process memory usage"

    self._process = psutil.Process()

  async def _read(self):
    memory_info = self._process.memory_info()
    self.value = (time.time(), memory_info.rss * ureg.byte)

class EpochNode(NumericNode, PollableReadableNode):
  def __init__(self):
    super().__init__(
      context="time",
      dtype='u8',
      poll_interval=0.3,
      readable=True
    )

    self.connected = True
    self.description = "Time since Jan 1st, 1970"
    self.icon = "schedule"
    self.id = NodeId('epoch')
    self.label = "Unix epoch"

  async def _read(self):
    self.value = (time.time(), time.time() * ureg.sec)

class RandomNode(NumericNode, PollableReadableNode):
  def __init__(self):
    super().__init__(
      dtype='f4',
      poll_interval=0.2,
      range=(-1000 * ureg.dimensionless, 1000 * ureg.dimensionless),
      readable=True
    )

    self.connected = True
    self.id = NodeId('random')
    self.label = "Random"

  async def _read(self):
    self.value = (time.time(), (random.random() - 0.5) * ureg.dimensionless * 1000)


class Executor(BaseExecutor):
  def __init__(self, conf: Any, *, host):
    self._device = SystemNode()
    host.devices[self._device.id] = self._device

  async def start(self):
    async with Pool.open() as pool:
      pool.start_soon(self._device.start())
      yield

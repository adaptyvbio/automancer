import asyncio
import random
import time
from typing import Any

import psutil
from pr1.devices.nodes.collection import DeviceNode
from pr1.devices.nodes.common import ConfigurableNode, NodeId
from pr1.devices.nodes.numeric import NumericNode
from pr1.devices.nodes.readable import PollableReadableNode
from pr1.devices.nodes.value import NullType
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
        RandomNode(),
        WaitNode()
      }
    }

class ProcessMemoryUsageNode(PollableReadableNode, NumericNode):
  def __init__(self):
    super().__init__(
      readable=True,
      dtype='u4',
      interval=0.3,
      unit=ureg.MB
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
      interval=0.3,
      unit=ureg.year
    )

    self.connected = True
    self.description = "Time since Jan 1st, 1970"
    self.id = NodeId('epoch')
    self.label = "Unix epoch"

  async def _read_value(self):
    return time.time() * ureg.sec

class RandomNode(PollableReadableNode, NumericNode):
  def __init__(self):
    super().__init__(
      readable=True,
      dtype='f4',
      interval=0.2
    )

    self.connected = True
    self.id = NodeId('random')
    self.label = "Random"

  async def _read_value(self):
    return random.random()

class WaitNode(NumericNode):
  def __init__(self):
    super().__init__(
      unit=ureg.sec,
      writable=True
    )

    self.connected = True
    self.icon = "schedule"
    self.id = NodeId('wait')
    self.label = "Wait"

  async def _write(self, value, /):
    assert not isinstance(value, NullType)
    await asyncio.sleep(value.magnitude) # type: ignore


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

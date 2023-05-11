import asyncio
import random
import time
from typing import Any

import psutil
from pr1.devices.nodes.collection import DeviceNode
from pr1.devices.nodes.common import NodeId
from pr1.devices.nodes.numeric import NumericNode
from pr1.devices.nodes.readable import PollableReadableNode
from pr1.devices.nodes.value import NullType
from pr1.units.base import BaseExecutor
from pr1.ureg import ureg

from pr1.host import Host
from pr1.util.pool import Pool

from . import namespace


class SystemNode(DeviceNode):
  owner = namespace

  def __init__(self, *, pool: Pool):
    super().__init__()

    self.connected = True
    self.description = None
    self.id = NodeId("System")
    self.label = "System device"

    self.nodes = {
      node.id: node for node in {
        EpochNode(pool=pool),
        ProcessMemoryUsageNode(pool=pool),
        RandomNode(pool=pool),
        WaitNode()
      }
    }

class ProcessMemoryUsageNode(PollableReadableNode, NumericNode):
  def __init__(self, *, pool: Pool):
    super().__init__(
      dtype='u4',
      interval=0.3,
      pool=pool,
      readable=True,
      unit=ureg.MB
    )

    self.connected = True
    self.icon = "memory_alt"
    self.id = NodeId('memory')
    self.label = "Process memory usage"

    self._process = psutil.Process()

  async def _read_value(self):
    memory_info = self._process.memory_info()
    return memory_info.rss * ureg.byte

class EpochNode(PollableReadableNode, NumericNode):
  def __init__(self, *, pool: Pool):
    super().__init__(
      dtype='u8',
      interval=0.3,
      pool=pool,
      readable=True,
      unit=ureg.year
    )

    self.connected = True
    self.description = "Time since Jan 1st, 1970"
    self.id = NodeId('epoch')
    self.label = "Unix epoch"

  async def _read_value(self):
    return time.time() * ureg.sec

class RandomNode(PollableReadableNode, NumericNode):
  def __init__(self, *, pool: Pool):
    super().__init__(
      dtype='f4',
      interval=0.2,
      pool=pool,
      readable=True
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
    self._device = SystemNode(pool=host.pool)
    host.devices[self._device.id] = self._device

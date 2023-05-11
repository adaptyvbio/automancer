import asyncio
from logging import Logger
from typing import Any

from pr1.devices.nodes.collection import DeviceNode
from pr1.devices.nodes.common import NodeId
from pr1.devices.nodes.numeric import NumericNode
from pr1.devices.nodes.value import NullType
from pr1.host import Host
from pr1.units.base import BaseExecutor
from pr1.ureg import ureg
from pr1.util.decorators import provide_logger
from pr1.util.pool import Pool

from . import logger, namespace


class DebugNode(DeviceNode):
  owner = namespace

  def __init__(self, *, pool: Pool):
    super().__init__()

    self.connected = True
    self.description = None
    self.id = NodeId("Debug")

    self.nodes = {
      node.id: node for node in {
        PressureNode(pool=pool),
        WaitNode(pool=pool)
      }
    }

class WaitNode(NumericNode):
  def __init__(self, *, pool: Pool):
    super().__init__(
      pool=pool,
      unit=ureg.sec,
      writable=True
    )

    self.connected = True
    self.icon = "schedule"
    self.id = NodeId('wait')
    self.label = "Wait"

  async def _clear(self):
    print("Clear")

  async def _write(self, value, /):
    print("Write >>", value)

    assert not isinstance(value, NullType)
    await asyncio.sleep(value.magnitude) # type: ignore


@provide_logger(logger)
class PressureNode(NumericNode):
  def __init__(self, *, pool: Pool):
    super().__init__(
      pool=pool,
      unit=ureg.psi,
      writable=True
    )

    self.connected = True
    self.icon = "design_services"
    # self.icon = "history_edu"
    self.id = NodeId('pressure')
    self.label = "Pressure"

    self._logger: Logger

  async def _clear(self):
    self._logger.info("Clear")

  async def _write(self, value, /):
    self._logger.info(f"Write {value!r}")


class Executor(BaseExecutor):
  def __init__(self, conf: Any, *, host: Host):
    self._device = DebugNode(pool=host.pool)
    host.devices[self._device.id] = self._device

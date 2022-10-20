import asyncio
import traceback
from typing import Any, Optional

from okolab import OkolabDevice, OkolabDeviceDisconnectedError
from pr1.device import BooleanNode

from . import logger, namespace


class BaseNode:
  @property
  def connected(self) -> bool:
    raise NotImplementedError()

class ReadonlyScalarNode(BaseNode):
  value: Optional[float]

  def export(self):
    return {
      "type": "scalar",
      "value": self.value
    }

class PolledNodeUnavailable(Exception):
  pass

class PolledReadonlyScalarNode(ReadonlyScalarNode):
  _interval: float

  def __init__(self):
    super().__init__()
    self._poll_task = None

  async def _configure(self):
    async def poll_loop():
      try:
        while True:
          value = await self._read()

          if value is not None:
            self.value = value

          await asyncio.sleep(self._interval)
      except (asyncio.CancelledError, PolledNodeUnavailable):
        pass
      except Exception:
        traceback.print_exc()
      finally:
        self._poll_task = None

    self._poll_task = asyncio.create_task(poll_loop())

  async def _unconfigure(self):
    if self._poll_task:
      self._poll_task.cancel()

  async def _read(self) -> Optional[float]:
    raise NotImplementedError()

class ScalarNode(BaseNode):
  target_value: Optional[float]
  value: Optional[float]

  # @property
  # def value(self) -> Optional[float]:
  #   raise NotImplementedError()

  # @property
  # def target_value(self) -> Optional[float]:
  #   raise NotImplementedError()

  def export(self):
    return {
      "type": "scalar",
      "targetValue": self.target_value,
      "value": self.value
    }

  async def write(self, value: float, /):
    raise NotImplementedError()

class BaseDevice:
  connected: bool
  id: str
  label: Optional[str]
  model: str
  nodes: dict[str, BaseNode]


class TemperatureReadoutNode(PolledReadonlyScalarNode):
  def __init__(self, *, index: int, master: 'MasterDevice'):
    self._index = index
    self._master = master

  async def _read(self):
    try:
      match self._index:
        case 1: return await self._master.get_temperature1()
    except OkolabDeviceDisconnectedError as e:
      raise PolledNodeUnavailable() from e

class TemperatureSetpointNode(ScalarNode):
  # target_value: Optional[float]
  # value: Optional[float]

  def __init__(self, *, index: int, master: 'MasterDevice'):
    self._index = index
    self._master = master

    self.target_value = None
    self.value = None

  @property
  def connected(self):
    return self._master.connected

  async def write(self, value: float, /):
    self.target_value = value

    if self._master.connected:
      await self._write()

  async def _configure(self):
    self.value = await self._master.get_temperature_setpoint1()

    if self.target_value is None:
      self.target_value = self.value

    if self.value != self.target_value:
      await self._write()

  async def _write(self):
    assert self.target_value is not None

    try:
      match self._index:
        case 1: await self._master.set_temperature_setpoint1(self.target_value)
    except OkolabDeviceDisconnectedError:
      pass
    else:
      self.value = self.target_value


class MasterDevice(BaseDevice, OkolabDevice):
  owner = namespace

  def __init__(self, *, id, label, serial_number):
    OkolabDevice.__init__(self, serial_number=serial_number)

    self.id = id
    self.label = label
    self.model = "Generic Okolab device"
    self.nodes = dict()

    self._workers: set['WorkerDevice'] = set()

  async def _on_connection(self, *, reconnection: bool):
    logger.info(f"Connected to '{self._serial_number}'")
    self.model = await self.get_product_name()

    for worker in self._workers:
      await worker._configure()

  async def _on_disconnection(self, *, lost: bool):
    if lost:
      logger.info("Lost connection to '{self._serial_number}'")

  async def initialize(self):
    await self.start()

  async def destroy(self):
    await self.stop()


class WorkerDevice(BaseDevice):
  def __init__(
    self,
    *,
    id: str,
    index: int,
    label: Optional[str],
    master: MasterDevice,
    side: Optional[int],
    type: int
  ):
    self.id = id
    self.label = label
    self.model = f"Okolab device (type {type})"

    self._node_readout = TemperatureReadoutNode(index=index, master=self._master)
    self._node_setpoint = TemperatureSetpointNode(index=index, master=self._master)

    self.nodes = {
      "readout": self._node_readout,
      "setpoint": self._node_setpoint
    }

    self._index = index
    self._master = master
    self._side = side
    self._type = type

  async def _configure(self):
    match self._index:
      case 1: await self._master.set_device1(self._type, side=self._side)

    await self._node_readout._configure()
    await self._node_setpoint._configure()

  async def _unconfigure(self):
    await self._node_readout._configure()

  @property
  def connected(self):
    return self._master.connected

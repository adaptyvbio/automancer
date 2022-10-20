import asyncio
import traceback
from typing import Callable, Optional

from okolab import OkolabDevice, OkolabDeviceDisconnectedError
from pr1.device import BooleanNode

from . import logger, namespace


class BaseNode:
  @property
  def connected(self) -> bool:
    raise NotImplementedError()

class ReadonlyScalarNode(BaseNode):
  def __init__(self):
    self.value: Optional[float] = None

  def export(self):
    return {
      "type": "readonlyScalar",
      "value": self.value
    }

class PolledNodeUnavailable(Exception):
  pass

class PolledReadonlyScalarNode(ReadonlyScalarNode):
  def __init__(self, *, interval):
    super().__init__()

    self._poll_task = None
    self._interval = interval

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
  def __init__(self):
    target_value: Optional[float] = None
    value: Optional[float] = None

  def export(self):
    return {
      "type": "scalar",
      "targetValue": self.target_value,
      "value": self.value
    }

  async def write(self, value: float, /):
    raise NotImplementedError()

class BaseDevice:
  def __init__(self):
    connected: bool
    id: str
    label: Optional[str]
    model: str
    nodes: dict[str, BaseNode]
    owner: str


class TemperatureReadoutNode(PolledReadonlyScalarNode):
  id = "readout"
  label = "Temperature readout"

  def __init__(self, *, index: int, master: 'MasterDevice'):
    super().__init__(interval=1.0)

    self._index = index
    self._master = master

  @property
  def connected(self):
    return self._master.connected

  async def _read(self):
    try:
      match self._index:
        case 1: return await self._master.get_temperature1()
    except OkolabDeviceDisconnectedError as e:
      raise PolledNodeUnavailable() from e

class TemperatureSetpointNode(ScalarNode):
  id = "setpoint"
  label = "Temperature setpoint"

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

  def __init__(
    self,
    *,
    id: str,
    label: Optional[str],
    serial_number: str,
    update_callback: Callable[[], None],
  ):
    OkolabDevice.__init__(self, serial_number=serial_number)

    self.id = id
    self.label = label
    self.model = "Generic Okolab device"
    self.nodes = set()

    self._update_callback = update_callback
    self._workers: set['WorkerDevice'] = set()

  async def _on_connection(self, *, reconnection: bool):
    logger.info(f"Connected to '{self._serial_number}'")
    self.model = await self.get_product_name()

    for worker in self._workers:
      await worker._configure()

    if len(self._workers) < 1:
      await self.set_device1(None)
    if len(self._workers) < 2:
      await self.set_device2(None)

    self._update_callback()

  async def _on_connection_fail(self, reconnection: bool):
    if not reconnection:
      logger.warning(f"Failed connecting to '{self._serial_number}'")

  async def _on_disconnection(self, *, lost: bool):
    if lost:
      logger.warning(f"Lost connection to '{self._serial_number}'")

    for worker in self._workers:
      await worker._unconfigure()

    self._update_callback()

  async def initialize(self):
    await self.start()

  async def destroy(self):
    await self.stop()


class WorkerDevice(BaseDevice):
  owner = namespace

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

    self._index = index
    self._master = master
    self._side = side
    self._type = type

    self._node_readout = TemperatureReadoutNode(index=index, master=master)
    self._node_setpoint = TemperatureSetpointNode(index=index, master=master)

    self.nodes = {self._node_readout, self._node_setpoint}

  async def _configure(self):
    match self._index:
      case 1: await self._master.set_device1(self._type, side=self._side)

    await self._node_readout._configure()
    await self._node_setpoint._configure()

  async def _unconfigure(self):
    await self._node_readout._unconfigure()

  @property
  def connected(self):
    return self._master.connected

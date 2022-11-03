import asyncio
import traceback
from typing import Callable, Optional

from okolab import OkolabDevice, OkolabDeviceDisconnectedError, OkolabDeviceStatus
from pr1.devices.adapter import GeneralDeviceAdapter
from pr1.devices.node import DeviceNode, NodeUnavailableError, PolledReadableNode, ScalarReadableNode, ScalarWritableNode, BiWritableNode

from . import logger, namespace


class BoardTemperatureNode(PolledReadableNode[float], ScalarReadableNode):
  id = "boardTemperature"
  label = "Board temperature"

  def __init__(self, *, master: 'MasterDevice'):
    PolledReadableNode.__init__(self, min_interval=0.2)
    ScalarReadableNode.__init__(self)

    self._master = master

  async def _read(self):
    try:
      return await self._master._adapter.device.get_board_temperature()
    except OkolabDeviceDisconnectedError as e:
      raise NodeUnavailableError() from e


class TemperatureReadoutNode(ScalarReadableNode, PolledReadableNode[float]):
  id = "readout"
  label = "Temperature readout"

  def __init__(self, *, index: int, master: 'MasterDevice'):
    PolledReadableNode.__init__(self, min_interval=0.2)
    ScalarReadableNode.__init__(self)

    self._index = index
    self._master = master

  async def _read(self):
    try:
      match self._index:
        case 1: return await self._master._adapter.device.get_temperature1()
    except OkolabDeviceDisconnectedError as e:
      raise NodeUnavailableError() from e

class TemperatureSetpointNode(ScalarWritableNode, BiWritableNode):
  id = "setpoint"
  label = "Temperature setpoint"

  def __init__(self, *, index: int, master: 'MasterDevice'):
    ScalarWritableNode.__init__(self, range=(25.0, 60.0))
    BiWritableNode.__init__(self)

    self._index = index
    self._master = master

  async def _write(self, value: float):
    try:
      match self._index:
        case 1: await self._master._adapter.device.set_temperature_setpoint1(value)
    except OkolabDeviceDisconnectedError as e:
      raise NodeUnavailableError() from e


class MasterDevice(DeviceNode):
  owner = namespace

  def __init__(
    self,
    *,
    address: Optional[str],
    id: str,
    label: Optional[str],
    serial_number: Optional[str]
  ):
    super().__init__()

    self.id = id
    self.label = label
    self.model = "Generic Okolab device"


    parent = self

    class Controller(GeneralDeviceAdapter[OkolabDevice]):
      async def create_device(self, address: str, on_close: Callable):
        try:
          return OkolabDevice(address, on_close=on_close)
        except OkolabDeviceDisconnectedError:
          return None

      async def list_devices(self):
        return OkolabDevice.list()

      async def test_device(self, device: OkolabDevice):
        try:
          return await device.get_serial_number() == serial_number
        except OkolabDeviceDisconnectedError:
          return False

      async def on_connection(self, *, reconnection: bool):
        logger.info(f"Connected to {parent._label}")
        parent.model = await parent._adapter.device.get_product_name()

        await parent._node_board_temperature._configure()

        for worker in parent._workers:
          await worker._configure()

        if len(parent._workers) < 1:
          await parent._adapter.device.set_device1(None)
        if len(parent._workers) < 2:
          await parent._adapter.device.set_device2(None)

      async def on_connection_fail(self, reconnection: bool):
        if not reconnection:
          logger.warning(f"Failed connecting to {parent._label}")

      async def on_disconnection(self, *, lost: bool):
        if lost:
          logger.warning(f"Lost connection to {parent._label}")

        await parent._node_board_temperature._unconfigure()

        for worker in parent._workers:
          await worker._unconfigure()

    self._adapter = GeneralDeviceAdapter(
      address=address,
      controller=Controller()
    )

    self._node_board_temperature = BoardTemperatureNode(master=self)
    self._workers: set['WorkerDevice'] = set()

    self.nodes = { node.id: node for node in {self._node_board_temperature, *self._workers} }

  @property
  def connected(self):
    return self._adapter.connected

  async def initialize(self):
    await self._adapter.start()

  async def destroy(self):
    await self._adapter.stop()


class WorkerDevice(DeviceNode):
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
    super().__init__()

    self.id = id
    self.label = label
    self.model = f"Okolab device (type {type})"

    self._index = index
    self._master = master
    self._side = side
    self._type = type

    self._node_readout = TemperatureReadoutNode(index=index, master=master)
    self._node_setpoint = TemperatureSetpointNode(index=index, master=master)
    self._status = None
    self._status_check_task = None

    self.nodes = { node.id: node for node in {self._node_readout, self._node_setpoint} }

  async def _configure(self):
    match self._index:
      case 1: await self._master._adapter.device.set_device1(self._type, side=self._side)

    await self._node_readout._configure()
    await self._node_setpoint._configure()

    async def status_check_loop():
      try:
        while True:
          self._status = await self._master._adapter.device.get_status1()
          await asyncio.sleep(1)
      except (asyncio.CancelledError, OkolabDeviceDisconnectedError):
        pass
      except Exception:
        traceback.print_exc()
      finally:
        self._status_check_task = None

    self._status_check_task = asyncio.create_task(status_check_loop())

  async def _unconfigure(self):
    if self._status_check_task:
      self._status_check_task.cancel()

    await self._node_readout._unconfigure()
    await self._node_setpoint._unconfigure()

  @property
  def connected(self):
    return self._master.connected and (self._status in {OkolabDeviceStatus.Alarm, OkolabDeviceStatus.Ok, OkolabDeviceStatus.Transient})

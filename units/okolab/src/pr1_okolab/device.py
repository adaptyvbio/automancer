import asyncio
from asyncio import Task
from typing import Callable, Optional

from okolab import (OkolabDevice, OkolabDeviceConnectionError,
                    OkolabDeviceConnectionLostError)
from pint import Quantity
from pr1.devices.nodes.collection import DeviceNode
from pr1.devices.nodes.common import (ConfigurableNode, NodeId,
                                      NodeUnavailableError)
from pr1.devices.nodes.numeric import NumericNode
from pr1.devices.nodes.readable import PollableReadableNode
from pr1.devices.nodes.value import NullType
from pr1.util.asyncio import run_double, shield, try_all, wait_all
from pr1.util.pool import Pool

from . import logger, namespace


class BoardTemperatureNode(PollableReadableNode, NumericNode):
  def __init__(self, *, master: 'MasterDevice'):
    super().__init__(
      readable=True,
      interval=0.2,
      pool=master._pool,
      unit="degC"
    )

    self.icon = "thermostat"
    self.id = NodeId("boardTemperature")
    self.label = "Board temperature"

    self._master = master

  async def _read_value(self):
    assert (device := self._master._device)

    try:
      return await device.get_board_temperature()
    except OkolabDeviceConnectionError as e:
      raise NodeUnavailableError from e


class TemperatureReadoutNode(PollableReadableNode, NumericNode):
  def __init__(self, *, worker: 'WorkerDevice'):
    super().__init__(
      interval=0.2,
      pool=worker._master._pool,
      readable=True,
      unit="degC"
    )

    self.icon = "thermostat"
    self.id = NodeId("readout")
    self.label = "Temperature readout"

    self._worker = worker

  async def _read_value(self):
    try:
      return await self._worker._get_temperature_readout()
    except OkolabDeviceConnectionError as e:
      raise NodeUnavailableError from e

class TemperatureSetpointNode(NumericNode):
  def __init__(self, *, worker: 'WorkerDevice'):
    super().__init__(
      max=60.0,
      min=25.0,
      nullable=True,
      pool=worker._master._pool,
      readable=True,
      unit="degC",
      writable=True
    )

    self.icon = "thermostat"
    self.id = NodeId("setpoint")
    self.label = "Temperature setpoint"

    self._worker = worker

  async def _read_value(self):
    return await self._worker._get_temperature_setpoint()

  async def _write(self, value: Quantity | NullType, /):
    try:
      await self._worker._set_temperature_setpoint(value.m_as("degC") if not isinstance(value, NullType) else None)
    except OkolabDeviceConnectionError as e:
      raise NodeUnavailableError from e


class MasterDevice(DeviceNode):
  owner = namespace

  def __init__(
    self,
    *,
    address: Optional[str],
    id: str,
    label: Optional[str],
    pool: Pool,
    serial_number: Optional[str]
  ):
    super().__init__()

    self.connected = False
    self.description = "H401-T-CONTROLLER"
    self.id = NodeId(id)
    self.label = label

    self._address = address
    self._pool = pool
    self._serial_number = serial_number

    self._device: Optional[OkolabDevice] = None
    self._node_board_temperature = BoardTemperatureNode(master=self)
    self._task: Optional[Task[None]] = None

    # These will be added by the executor.
    self._worker1: Optional['WorkerDevice'] = None
    self._worker2: Optional['WorkerDevice'] = None

    self.nodes = {
      self._node_board_temperature.id: self._node_board_temperature
    }

  async def _connect(self, ready: Callable[[], bool]):
    while True:
      self._device = await self._find_device()

      if self._device:
        logger.info(f"Configuring {self._label}")

        try:
          if not self._worker1:
            await self._device.set_device1(None)
          if not self._worker2:
            await self._device.set_device2(None)

          self.connected = True

          try:
            await try_all([
              *([self._worker1.configure()] if self._worker1 else list()),
              *([self._worker2.configure()] if self._worker2 else list())
            ])

            logger.info(f"Connected to {self._label}")
            ready()

            try:
              await asyncio.shield(self._device.closed())
            except OkolabDeviceConnectionLostError:
              logger.warning(f"Lost connection to {self._label}")
          finally:
            self.connected = False

            await shield(wait_all([
              *([self._worker1.unconfigure()] if self._worker1 else list()),
              *([self._worker2.unconfigure()] if self._worker2 else list())
            ]))
        except* (NodeUnavailableError, OkolabDeviceConnectionError):
          pass
        finally:
          await shield(self._device.close())

      ready()

      # Wait 1 second before retrying
      await asyncio.sleep(1.0)

  async def _find_device(self):
    if self._address:
      return await self._create_device(lambda address = self._address: OkolabDevice(address))

    for info in OkolabDevice.list():
      if device := await self._create_device(info.create):
        return device
    else:
      return None

  async def _create_device(self, get_device: Callable[[], OkolabDevice], /):
    try:
      device = get_device()
    except OkolabDeviceConnectionError:
      return None

    try:
      await device.open()

      # Look for protocol errors which would occur if this device is not an Okolab temperature controller.
      await device.get_uptime()

      if (not self._serial_number) or ((await device.get_serial_number()) == self._serial_number):
        return device
    except OkolabDeviceConnectionError:
      await shield(device.close())
    except BaseException:
      await shield(device.close())
      raise

    return None

  async def initialize(self):
    self._task = self._pool.add(await run_double(self._connect))

    if not self.connected:
      logger.warning(f"Failed connecting to {self._label}")


class WorkerDevice(DeviceNode, ConfigurableNode):
  owner = namespace

  def __init__(
    self,
    *,
    description: Optional[str],
    id: str,
    index: int,
    label: Optional[str],
    master: MasterDevice,
    side: Optional[int],
    type: int
  ):
    super().__init__()

    self.description = description or f"Okolab device (type {type})"
    self.id = NodeId(id)
    self.label = label

    self._enabled: Optional[bool] = None
    self._index = index
    self._master = master
    self._side = side
    self._type = type

    self._node_readout = TemperatureReadoutNode(worker=self)
    self._node_setpoint = TemperatureSetpointNode(worker=self)
    self._status = None
    self._status_check_task = None

    self.nodes = { node.id: node for node in {self._node_readout, self._node_setpoint} }

  async def configure(self):
    await self._set_enabled(False)

  async def unconfigure(self):
    # The connection may have been lost already.
    try:
      await self._set_enabled(False)
    except OkolabDeviceConnectionError:
      pass

  async def _get_temperature_readout(self):
    assert (device := self._master._device)

    match self._index:
      case 1: return await device.get_temperature1()
      case 2: return await device.get_temperature2()

  async def _get_temperature_setpoint(self):
    assert (device := self._master._device)

    match self._index:
      case 1: return await device.get_temperature_setpoint1()
      case 2: return await device.get_temperature_setpoint2()

  async def _set_enabled(self, enabled: bool, /):
    if enabled != self._enabled:
      assert (device := self._master._device)

      self._enabled = enabled

      match self._index:
        case 1: await device.set_device1(self._type if enabled else None, side=self._side)
        case 2: await device.set_device2(self._type if enabled else None, side=self._side)

  async def _set_temperature_setpoint(self, value: Optional[float], /):
    assert (device := self._master._device)

    enabled = (value is not None)
    await self._set_enabled(enabled)

    if enabled:
      match self._index:
        case 1: await device.set_temperature_setpoint1(value)
        case 2: await device.set_temperature_setpoint2(value)

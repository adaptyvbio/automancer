import asyncio
import time
from asyncio import Task
from typing import Callable, Optional

from okolab import OkolabDevice, OkolabDeviceConnectionError
from pint import Quantity
from pr1.devices.nodes.collection import DeviceNode
from pr1.devices.nodes.common import (ConfigurableNode, NodeId,
                                      NodeUnavailableError)
from pr1.devices.nodes.numeric import NumericNode
from pr1.devices.nodes.readable import PollableReadableNode
from pr1.devices.nodes.value import NullType
from pr1.ureg import ureg
from pr1.util.asyncio import shield, try_all, wait_all
from pr1.util.pool import Pool

from . import logger, namespace


class BoardTemperatureNode(NumericNode, PollableReadableNode):
  def __init__(self, *, master: 'MasterDevice'):
    super().__init__(
      readable=True,
      poll_interval=1.0,
      unit="degC"
    )

    self.icon = "thermostat"
    self.id = NodeId("boardTemperature")
    self.label = "Board temperature"

    self._master = master

  async def _read(self):
    assert (device := self._master._device)

    async def read():
      return (await device.get_board_temperature()) * ureg.degC

    try:
      await self._set_value_at_half_time(read())
    except OkolabDeviceConnectionError as e:
      raise NodeUnavailableError from e


class TemperatureReadoutNode(NumericNode, PollableReadableNode):
  def __init__(self, *, worker: 'WorkerDevice'):
    super().__init__(
      poll_interval=0.2,
      readable=True,
      unit="degC"
    )

    self.icon = "thermostat"
    self.id = NodeId("readout")
    self.label = "Temperature readout"

    self._worker = worker

  async def _read(self):
    async def read():
      return (await self._worker._get_temperature_readout()) * ureg.degC

    try:
      await self._set_value_at_half_time(read())
    except OkolabDeviceConnectionError as e:
      raise NodeUnavailableError from e

class TemperatureSetpointNode(NumericNode, PollableReadableNode):
  def __init__(self, *, worker: 'WorkerDevice'):
    super().__init__(
      max=60.0,
      min=25.0,
      nullable=True,
      poll_interval=5.0,
      readable=True,
      unit="degC",
      writable=True
    )

    self.icon = "thermostat"
    self.id = NodeId("setpoint")
    self.label = "Temperature setpoint"

    self._worker = worker

  async def _read(self):
    async def read():
      return (await self._worker._get_temperature_setpoint()) * ureg.degC

    try:
      await self._set_value_at_half_time(read())
    except OkolabDeviceConnectionError as e:
      raise NodeUnavailableError from e

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
    serial_number: Optional[str]
  ):
    super().__init__()

    self.connected = False
    self.description = "H401-T-CONTROLLER"
    self.id = NodeId(id)
    self.label = label

    self._address = address
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

  async def _connect(self):
    ready = False

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
          self._node_board_temperature.connected = True

          try:
            await try_all([
              *([self._worker1.configure()] if self._worker1 else list()),
              *([self._worker2.configure()] if self._worker2 else list())
            ])

            logger.info(f"Connected to {self._label}")

            if not ready:
              yield
              ready = True

            await self._device.closed()
            logger.warning(f"Lost connection to {self._label}")
          finally:
            self.connected = False
            self._node_board_temperature.connected = False

            # Problem with shield()
            await shield(wait_all([
              *([self._worker1.unconfigure()] if self._worker1 else list()),
              *([self._worker2.unconfigure()] if self._worker2 else list())
            ]))

            await shield(self._device.close())
            self._device = None
        except* (NodeUnavailableError, OkolabDeviceConnectionError):
          pass

      if not ready:
        yield
        ready = True

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

  async def start(self):
    async with Pool.open() as pool:
      if self._worker1:
        pool.start_soon(self._worker1.start(), priority=1)
      if self._worker2:
        pool.start_soon(self._worker2.start(), priority=1)

      pool.start_soon(self._node_board_temperature.start(), priority=1)

      await pool.wait_until_ready(self._connect())

      if not self.connected:
        logger.warning(f"Failed connecting to {self._label}")

      yield


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
    await self._set_enabled(True)

    self._node_readout.connected = True
    self._node_setpoint.connected = True

  async def unconfigure(self):
    self._node_readout.connected = False
    self._node_setpoint.connected = False

    # The connection may have been lost already.
    try:
      await self._set_enabled(False)
    except OkolabDeviceConnectionError:
      pass

  async def start(self):
    async with Pool.open() as pool:
      pool.start_soon(self._node_readout.start())
      pool.start_soon(self._node_setpoint.start())

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

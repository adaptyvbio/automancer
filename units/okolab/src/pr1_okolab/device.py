import asyncio
from asyncio import Task
import contextlib
from typing import Callable, Optional

from okolab import OkolabDevice, OkolabDeviceConnectionError, OkolabDeviceConnectionLostError, OkolabDeviceStatus
from pr1.devices.nodes.collection import DeviceNode
from pr1.devices.nodes.common import ConfigurableNode, NodeId, NodeUnavailableError, configure, unconfigure
from pr1.devices.nodes.numeric import NumericNode
from pr1.devices.nodes.readable import PollableReadableNode
from pr1.util.types import SimpleCallbackFunction
from pr1.util.asyncio import cancel_task, run_double

from . import logger, namespace


class BoardTemperatureNode(PollableReadableNode, NumericNode):
  id = NodeId("boardTemperature")
  label = "Board temperature"

  def __init__(self, *, master: 'MasterDevice'):
    super().__init__(
      readable=True,
      min_interval=0.2,
      unit="degC"
    )

    self._master = master

  async def _read_value(self):
    assert (device := self._master._device)

    try:
      return await device.get_board_temperature()
    except OkolabDeviceConnectionError as e:
      raise NodeUnavailableError from e


class TemperatureReadoutNode(PollableReadableNode, NumericNode):
  id = NodeId("readout")
  label = "Temperature readout"

  def __init__(self, *, worker: 'WorkerDevice'):
    super().__init__(
      readable=True,
      min_interval=0.2,
      unit="degC"
    )

    self._worker = worker

  async def _read_value(self):
    try:
      return await self._worker._get_temperature_readout()
    except OkolabDeviceConnectionError as e:
      raise NodeUnavailableError from e

class TemperatureSetpointNode(NumericNode):
  id = NodeId("setpoint")
  label = "Temperature setpoint"

  def __init__(self, *, worker: 'WorkerDevice'):
    super().__init__(
      nullable=True,
      readable=True,
      writable=True,
      min=25.0,
      max=60.0,
      unit="degC"
    )

    self._worker = worker

  async def _read_value(self):
    return await self._worker._get_temperature_setpoint()

  async def _write(self, value: Optional[float], /):
    try:
      await self._worker._set_temperature_setpoint(value)
    except OkolabDeviceConnectionError as e:
      raise NodeUnavailableError from e

# for x in TemperatureSetpointNode.mro():
#   print(x)

class MasterDevice(DeviceNode):
  model = "H401-T-CONTROLLER"
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
    self.description = None
    self.id = NodeId(id)
    self.label = label
    self.model = "Generic Okolab device"

    self._address = address
    self._serial_number = serial_number

    self._node_board_temperature = BoardTemperatureNode(master=self)
    self._task: Optional[Task[None]] = None

    # These will be added by the executor.
    self._worker1: Optional['WorkerDevice'] = None
    self._worker2: Optional['WorkerDevice'] = None

    self.nodes = {
      self._node_board_temperature.id: self._node_board_temperature
    }

  async def _connect(self, ready: SimpleCallbackFunction):
    while True:
      self._device = await self._find_device()

      if self._device:
        logger.info(f"Configuring {self._label}")

        async with self._device:
          try:
            if not self._worker1:
              await self._device.set_device1(None)
            if not self._worker2:
              await self._device.set_device2(None)

            async with (
              self._node_board_temperature,
              self._worker1 or contextlib.nullcontext(),
              self._worker2 or contextlib.nullcontext()
            ):
              self.connected = True

              logger.info(f"Connected to {self._label}")
              ready()

              try:
                await self._device.closed()
              except OkolabDeviceConnectionLostError:
                logger.warning(f"Lost connection to {self._label}")
          except (NodeUnavailableError, OkolabDeviceConnectionError):
            continue

      ready()

      # Wait 1 second before retrying.
      await asyncio.sleep(1.0)

  async def _find_device(self):
    if self._address:
      return await self._create_device(lambda address = self._address: OkolabDevice(address))

    for info in OkolabDevice.list():
      if device := await self._create_device(info.create):
        return device
    else:
      return None

  async def _create_device(self, create_device: Callable[[], OkolabDevice], /):
    try:
      device = create_device()

      # Look for protocol errors which would occur if this device is not an Okolab temperature controller.
      await device.get_uptime()

      if (not self._serial_number) or ((await device.get_serial_number()) == self._serial_number):
        return device
    except OkolabDeviceConnectionError:
      pass

    return None

  async def initialize(self):
    self._task = await run_double(self._connect)

    if not self.connected:
      logger.warning(f"Failed connecting to {self._label}")

  async def destroy(self):
    await cancel_task(self._task)
    self._task = None


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

    self.description = description
    self.id = NodeId(id)
    self.label = label
    self.model = f"Okolab device (type {type})"

    self._enabled = False
    self._index = index
    self._master = master
    self._side = side
    self._type = type

    self._node_readout = TemperatureReadoutNode(worker=self)
    self._node_setpoint = TemperatureSetpointNode(worker=self)
    self._status = None
    self._status_check_task = None

    self.nodes = { node.id: node for node in {self._node_readout, self._node_setpoint} }

  async def _configure(self):
    async with (
      configure(self._node_readout),
      configure(self._node_setpoint)
    ):
      await self._set_enabled(False)

  async def _unconfigure(self):
    async with (
      unconfigure(self._node_readout),
      unconfigure(self._node_setpoint)
    ):
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

      if not enabled:
        await self._node_readout._unconfigure()

      match self._index:
        case 1: await device.set_device1(self._type if enabled else None, side=self._side)
        case 2: await device.set_device2(self._type if enabled else None, side=self._side)

      if enabled:
        await self._node_readout._configure()

      self._enabled = enabled

  async def _set_temperature_setpoint(self, value: Optional[float], /):
    assert (device := self._master._device)

    enabled = (value is not None)
    await self._set_enabled(enabled)

    if enabled:
      match self._index:
        case 1: await device.set_temperature_setpoint1(value)
        case 2: await device.set_temperature_setpoint2(value)

  # @property
  # def connected(self):
  #   return self._master.connected and (self._status in {OkolabDeviceStatus.Alarm, OkolabDeviceStatus.Ok, OkolabDeviceStatus.Transient})

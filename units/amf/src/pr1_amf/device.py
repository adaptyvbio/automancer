import asyncio
from typing import Callable, Optional

from amf_rotary_valve import AMFDevice, AMFDeviceConnectionError
from pr1.devices.nodes.collection import DeviceNode
from pr1.devices.nodes.common import NodeId, NodeUnavailableError
from pr1.devices.nodes.primitive import EnumNode, EnumNodeCase
from pr1.util.asyncio import aexit_handler, run_double, shield
from pr1.util.pool import Pool

from . import logger, namespace


class RotaryValvePositionNode(EnumNode[int]):
  def __init__(
    self,
    *,
    master: 'RotaryValveDevice',
    valve_count: int
  ):
    super().__init__(
      cases=[EnumNodeCase((index + 1), label=f"Valve {index + 1}") for index in range(valve_count)],
      readable=True,
      writable=True
    )

    self.id = NodeId("position")
    self.icon = "360"
    self.label = "Position"

    self._master = master
    self._valve_count = valve_count

  async def __aenter__(self):
    assert (device := self._master._device)

    if (observed_valve_count := await device.get_valve_count()) != self._valve_count:
      logger.error(f"Invalid valve count, found {observed_valve_count}, expected {self._valve_count}")
      raise NodeUnavailableError

    self.connected = True

  @aexit_handler
  async def __aexit__(self):
    self.connected = False

  async def _read_value(self):
    assert (device := self._master._device)

    try:
      return await device.get_valve()
    except AMFDeviceConnectionError as e:
      raise NodeUnavailableError from e

  async def _write(self, value: int, /):
    assert (device := self._master._device)

    try:
      await device.rotate(value)
    except AMFDeviceConnectionError as e:
      raise NodeUnavailableError from e


class RotaryValveDevice(DeviceNode):
  model = "LSP rotary valve"
  owner = namespace

  def __init__(
    self,
    *,
    address: Optional[str],
    id: str,
    label: Optional[str],
    serial_number: Optional[str],
    valve_count: int
  ):
    super().__init__()

    self.connected = False
    self.id = NodeId(id)
    self.label = label

    self._address = address
    self._serial_number = serial_number

    self._device: Optional[AMFDevice] = None
    self._node = RotaryValvePositionNode(
      master=self,
      valve_count=valve_count
    )

    self.nodes = { self._node.id: self._node }

  async def _connect(self):
    ready = False

    while True:
      self._device = await self._find_device()

      if self._device:
        logger.info(f"Configuring {self._label}")

        try:
          # Initialize the rotary valve
          if not await self._device.get_valve():
            await self._device.home()

          self.connected = True

          async with self._node:
            logger.info(f"Connected to {self._label}")

            if not ready:
              ready = True
              yield

            # Wait for the device to disconnect
            await self._device.wait_error()
            logger.warning(f"Lost connection to {self._label}")
        except* (AMFDeviceConnectionError, NodeUnavailableError):
          pass
        finally:
          self.connected = False
          await shield(self._device.close())

      # If the above failed, still mark the device as ready
      if not ready:
        ready = True
        yield

      # Wait before retrying
      await asyncio.sleep(1.0)

  async def _find_device(self):
    if self._address:
      return await self._create_device(lambda address = self._address: AMFDevice(address))

    for info in AMFDevice.list():
      if device := await self._create_device(info.create):
        return device
    else:
      return None

  async def _create_device(self, get_device: Callable[[], AMFDevice], /):
    try:
      device = get_device()
    except AMFDeviceConnectionError:
      return None

    try:
      await device.open()

      # Query the serial number even if not needed to detect protocol errors.
      serial_number = await device.get_unique_id()

      if (not self._serial_number) or (serial_number == self._serial_number):
        return device
    except AMFDeviceConnectionError:
      await shield(device.close())
    except BaseException:
      await shield(device.close())
      raise

    return None

  async def start(self):
    async with Pool.open() as pool:
      pool.start_soon(self._node.start())

      await pool.wait_until_ready(self._connect())

      if not self.connected:
        logger.warning(f"Failed connecting to {self._label}")

      yield

import asyncio
from typing import Callable, Optional

from amf_rotary_valve import AMFDevice, AMFDeviceConnectionError, AMFDeviceConnectionLostError
from pr1.devices.nodes.collection import DeviceNode
from pr1.devices.nodes.common import NodeId, NodeUnavailableError, configure
from pr1.devices.nodes.primitive import EnumNode, EnumNodeCase
from pr1.devices.nodes.value import NullType
from pr1.util.asyncio import cancel_task, run_double
from pr1.util.types import SimpleCallbackFunction

from . import logger, namespace


class RotaryValvePositionNode(EnumNode[int]):
  def __init__(
    self,
    *,
    master: 'RotaryValveDevice',
    valve_count: int
  ):
    super().__init__(
      readable=True,
      writable=True,
      cases=[EnumNodeCase((index + 1), label=f"Valve {index + 1}") for index in range(valve_count)]
    )

    self.id = NodeId("position")
    self.icon = "360"
    self.label = "Position"

    self._master = master
    self._valve_count = valve_count

  async def _configure(self):
    async with configure(super()):
      assert (device := self._master._device)

      if (observed_valve_count := await device.get_valve_count()) != self._valve_count:
        logger.error(f"Invalid valve count, found {observed_valve_count}, expected {self._valve_count}")
        raise NodeUnavailableError

      self.connected = True

  async def _unconfigure(self):
    self.connected = False
    await super()._unconfigure()

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

    self.value = value


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

  async def _connect(self, ready: SimpleCallbackFunction):
    while True:
      self._device = await self._find_device()

      if self._device:
        logger.info(f"Configuring {self._label}")

        async with self._device:
          try:
            if not await self._device.get_valve():
              await self._device.home()

            self.connected = True

            try:
              try:
                await self._node._configure()
              except NodeUnavailableError:
                pass

              logger.info(f"Connected to {self._label}")
              ready()

              try:
                await self._device.closed()
              except AMFDeviceConnectionLostError:
                logger.warning(f"Lost connection to {self._label}")
              finally:
                if self._node.connected:
                  await self._node._unconfigure()
            finally:
              self.connected = False
          except (NodeUnavailableError, AMFDeviceConnectionError):
            pass

      ready()
      await asyncio.sleep(1.0)

  async def _find_device(self):
    if self._address:
      return await self._create_device(lambda address = self._address: AMFDevice(address))

    for info in AMFDevice.list(all=True):
      if device := await self._create_device(info.create):
        return device
    else:
      return None

  async def _create_device(self, create_device: Callable[[], AMFDevice], /):
    try:
      device = create_device()

      # Query the serial number even if not needed to detect protocol errors.
      serial_number = await device.get_unique_id()

      if (not self._serial_number) or (serial_number == self._serial_number):
        return device
    except AMFDeviceConnectionError:
      pass

    return None

  async def initialize(self):
    self._task = await run_double(self._connect)

    if not self.connected:
      logger.warning(f"Failed connecting to {self._label}")

  async def destroy(self):
    await cancel_task(self._task)
    self._task = None

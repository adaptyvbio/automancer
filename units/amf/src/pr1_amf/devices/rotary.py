from typing import Callable, Optional

from pr1.devices.adapter import GeneralDeviceAdapter, GeneralDeviceAdapterController
from pr1.devices.node import BiWritableNode, DeviceNode, EnumNodeOption, EnumWritableNode, NodeUnavailableError

from .amf import AMFRotaryValveDevice, AMFRotaryValveDeviceDisconnectedError
from .. import logger, namespace


class RotaryValveNode(EnumWritableNode, BiWritableNode):
  id = "rotation"
  label = "Rotation"

  def __init__(self, *, device: 'RotaryValveDevice', valve_count: int):
    EnumWritableNode.__init__(self, options=[EnumNodeOption(f"Valve {index}") for index in range(valve_count)])
    BiWritableNode.__init__(self)

    self._device = device

  async def _read(self):
    try:
      return await self._device._adapter.device.get_valve() - 1
    except AMFRotaryValveDeviceDisconnectedError as e:
      raise NodeUnavailableError() from e

  async def _write(self, value: int):
    try:
      await self._device._adapter.device.rotate(value + 1)
    except AMFRotaryValveDeviceDisconnectedError as e:
      raise NodeUnavailableError() from e


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
    self.id = id
    self.label = label

    self._node = RotaryValveNode(device=self, valve_count=valve_count)
    self.nodes = { node.id: node for node in {self._node} }


    parent = self

    class Controller(GeneralDeviceAdapterController[AMFRotaryValveDevice]):
      async def create_device(self, address: str, on_close: Callable):
        try:
          return AMFRotaryValveDevice(address, on_close=on_close)
        except AMFRotaryValveDeviceDisconnectedError:
          return None

      async def list_devices(self):
        return await AMFRotaryValveDevice.list()

      async def test_device(self, device: AMFRotaryValveDevice):
        try:
          return await device.get_unique_id() == serial_number
        except AMFRotaryValveDeviceDisconnectedError:
          return False

      async def on_connection(self, *, reconnection: bool):
        logger.info(f"Connected to {parent._label}")

        try:
          if await parent._adapter.device.get_valve() == 0:
            await parent._adapter.device.home()
        except AMFRotaryValveDeviceDisconnectedError:
          return

        parent.connected = True
        await parent._node._configure()

      async def on_connection_fail(self, reconnection: bool):
        if not reconnection:
          logger.warning(f"Failed connecting to {parent._label}")

      async def on_disconnection(self, *, lost: bool):
        if lost:
          logger.warning(f"Lost connection to {parent._label}")

        parent.connected = False
        await parent._node._unconfigure()


    self._adapter = GeneralDeviceAdapter(
      address=address,
      controller=Controller()
    )

  async def initialize(self):
    await self._adapter.start()

  async def destroy(self):
    await self._adapter.stop()

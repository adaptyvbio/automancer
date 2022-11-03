from typing import Optional

from pr1.devices.adapter import GeneralDeviceAdapter
from pr1.devices.node import BaseWritableNode, DeviceNode

from .numato import NumatoRelayBoardDevice
from .. import logger, namespace


class RelayBoardNode(BaseWritableNode[bool]):
  def __init__(self, index: int, device: 'RelayBoardDevice'):
    super().__init__()

    self._device = device
    self._index = index

  @property
  def _mask(self):
    return (1 << self._index)

  @property
  def connected(self):
    return self._device.connected

  @property
  def id(self):
    return "relay" + str(self._index)

  @property
  def label(self):
    return f"Relay {self._index}"

  @property
  def current_value(self):
    if self._device._current_value is None:
      return None

    return (self._device._current_value & self._mask) > 0

  @property
  def target_value(self):
    if self._device._target_value is None:
      return None

    return (self._device._target_value & self._mask) > 0

  async def write(self, value: bool):
    full_value = ((self._device._target_value or 0) & ~self._mask) | (int(value) << self._index)
    self._device._target_value = full_value

    if self._device.connected:
      await self._device._adapter.device.write(full_value)
      self._device._current_value = full_value

    self._device._trigger_listeners()


class RelayBoardDevice(DeviceNode):
  model = "Numato relay module"
  owner = namespace

  def __init__(
    self,
    *,
    address: Optional[str],
    id: str,
    label: Optional[str],
    relay_count: int,
    serial_number: Optional[str]
  ):
    super().__init__()

    self.id = id
    self.label = label

    self._adapter = GeneralDeviceAdapter(
      NumatoRelayBoardDevice,
      address=address,
      on_connection=self._on_connection,
      on_connection_fail=self._on_connection_fail,
      on_disconnection=self._on_disconnection,
      test_device=self._test_device
    )

    self.nodes = { node.id: node for node in {RelayBoardNode(index, device=self) for index in range(relay_count)} }

    self._relay_count = relay_count
    self._serial_number = serial_number

    self._current_value = None
    self._target_value = None

  async def _on_connection(self, *, reconnection: bool):
    logger.info(f"Connected to {self._label}")

    self._current_value = await self._adapter.device.read()

    if self._target_value is None:
      self._target_value = self._current_value
    if self._current_value != self._target_value:
      await self._adapter.device.write(self._target_value)

    self._trigger_listeners()

  async def _on_connection_fail(self, reconnection: bool):
    if not reconnection:
      logger.warning(f"Failed connecting to {self._label}")

  async def _on_disconnection(self, *, lost: bool):
    if lost:
      logger.warning(f"Lost connection to {self._label}")

    self._trigger_listeners()

  async def _test_device(self, device: NumatoRelayBoardDevice):
    return await device.get_id() == self._serial_number

  @property
  def connected(self):
    return self._adapter.connected

  async def initialize(self):
    await self._adapter.start()

  async def destroy(self):
    await self._adapter.stop()

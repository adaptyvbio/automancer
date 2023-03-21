import functools
from typing import Callable, Optional

from pr1.devices.adapter import GeneralDeviceAdapter, GeneralDeviceAdapterController
from pr1.devices.node import ConfigurableWritableNode, BooleanWritableNode, DeviceNode, NodeUnavailableError, NumericWritableNode

from .numato import NumatoRelayBoardDevice, NumatoRelayBoardDeviceDisconnectedError
from .. import logger, namespace


class RelayBoardGlobalNode(NumericWritableNode, ConfigurableWritableNode):
  id = "global"
  label = "Global"

  def __init__(self, *, device: 'RelayBoardDevice'):
    NumericWritableNode.__init__(self)
    ConfigurableWritableNode.__init__(self)

    self._device = device

  async def _read(self):
    try:
      return await self._device._adapter.device.read()
    except NumatoRelayBoardDeviceDisconnectedError as e:
      raise NodeUnavailableError() from e

  async def write(self, value: int):
    try:
      await self._device._adapter.device.write(value)
    except NumatoRelayBoardDeviceDisconnectedError as e:
      raise NodeUnavailableError() from e


class RelayBoardNode(BooleanWritableNode):
  icon = "dynamic_form"
  # icon = "toggle_on"

  def __init__(self, index: int, device: 'RelayBoardDevice'):
    super().__init__()

    self._device = device
    self._index = index

  @functools.cached_property
  def _mask(self):
    return (1 << self._index)

  @property
  def connected(self):
    return self._device.connected

  @functools.cached_property
  def id(self):
    return "relay" + str(self._index)

  @functools.cached_property
  def label(self):
    return f"Relay {self._index}"

  @property
  def current_value(self):
    value: Optional[int] = self._device._global_node.current_value
    return (value & self._mask) > 0 if value is not None else None

  @property
  def target_value(self):
    value: Optional[int] = self._device._global_node.target_value
    return (value & self._mask) > 0 if value is not None else None

  async def write(self, value: bool):
    global_value = ((self._device._global_node.target_value or 0) & ~self._mask) | (int(value) << self._index)
    await self._device._global_node.write(global_value)

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

    self.connected = False
    self.id = id
    self.label = label


    self._global_node = RelayBoardGlobalNode(device=self)

    parent = self

    class Controller(GeneralDeviceAdapterController[NumatoRelayBoardDevice]):
      async def create_device(self, address: str, *, on_close: Callable):
        try:
          return NumatoRelayBoardDevice(address=address, on_close=on_close)
        except NumatoRelayBoardDeviceDisconnectedError:
          return None

      async def list_devices(self):
        return NumatoRelayBoardDevice.list()

      async def test_device(self, device: NumatoRelayBoardDevice):
        try:
          return await device.get_id() == serial_number
        except NumatoRelayBoardDeviceDisconnectedError:
          return False

      async def on_connection(self, *, reconnection: bool):
        logger.info(f"Connected to {parent._label}")

        parent.connected = True
        await parent._global_node._configure()

        parent._trigger_listeners()

      async def _on_disconnection(self, *, lost: bool):
        if lost:
          logger.warning(f"Lost connection to {parent._label}")

        parent.connected = False
        await parent._global_node._unconfigure()

        parent._trigger_listeners()


    self._adapter = GeneralDeviceAdapter(
      address=address,
      controller=Controller()
    )

    self.nodes = { node.id: node for node in {RelayBoardNode(index, device=self) for index in range(relay_count)} }

  async def initialize(self):
    await self._adapter.start()

  async def destroy(self):
    await self._adapter.stop()

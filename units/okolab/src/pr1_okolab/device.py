from typing import Any, Optional

from okolab import OkolabDevice, OkolabDeviceDisconnectedError
from pr1.device import BooleanNode

from . import logger, namespace


class BaseDevice:
  id: str
  label: Optional[str]
  model: str
  nodes: dict[str, Any]

class ScalarNode:
  @property
  def connected(self):
    raise NotImplementedError()

  @property
  def value(self):
    raise NotImplementedError()

  @property
  def target_value(self):
    raise NotImplementedError()

  def export(self):
    return {
      "type": "scalar",
      "targetValue": self.target_value,
      "value": self.value
    }


class TemperatureSetpointNode(ScalarNode):
  target_value: Optional[float]
  value: Optional[float]

  def __init__(self, *, device: "Device", index: int):
    self._device = device
    self._index = index

    self.target_value = None
    self.value = None

  @property
  def connected(self):
    return self._device.connected

  async def write(self, value: float):
    self.target_value = value

    if self._device.connected:
      try:
        match self._index:
          case 1: await self._device.set_temperature_setpoint1(value)
          # case 2: await self._device.set_temperature_setpoint2(value)
      except OkolabDeviceDisconnectedError:
        pass
      else:
        self.value = value


class Device(BaseDevice, OkolabDevice):
  owner = namespace

  def __init__(self, *, id, label, serial_number):
    OkolabDevice.__init__(self, serial_number=serial_number)

    self.id = id
    self.label = label
    self.model = "Generic Okolab device"

    self.temperature1 = TemperatureSetpointNode(device=self, index=1)
    self.temperature2 = TemperatureSetpointNode(device=self, index=2)

    self.nodes = {
      "temperature1": self.temperature1,
      "temperature2": self.temperature2
    }

  async def _on_connection(self, *, reconnection: bool):
    logger.info(f"Connected to '{self._serial_number}'")
    self.model = await self.get_product_name()

  async def _on_disconnection(self, *, lost: bool):
    if lost:
      logger.info("Lost connection to '{self._serial_number}'")

  async def initialize(self):
    await self.start()

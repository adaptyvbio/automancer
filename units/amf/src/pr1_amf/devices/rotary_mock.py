import asyncio

from pr1.device import SelectNode, SelectNodeOption

from .. import namespace


class MockRotaryValveNode(SelectNode):
  id = "position"
  label = "Position"

  def __init__(self, *, device):
    self._device = device

  @property
  def connected(self):
    return self._device.connected

  @property
  def options(self):
    return [SelectNodeOption(
      label=f"Valve {index + 1}",
      value=(index + 1)
    ) for index in range(self._device._valve_count)]

  @property
  def target_value(self):
    return self._device._valve_target

  @property
  def value(self):
    return self._device._valve_value

  async def write(self, valve):
    await self._device.rotate(valve)


class MockRotaryValveDevice:
  model = "LSP rotary valve (mock)"
  owner = namespace

  def __init__(self, *, id, label, update_callback, valve_count = 6):
    self.connected = False
    self.id = id
    self.label = label
    self.nodes=[MockRotaryValveNode(device=self)]

    self._rotation_future = None

    self._valve_count = valve_count
    self._valve_target = None
    self._valve_value = None

  async def initialize(self):
    self.connected = True

    self._valve_target = 1
    self._valve_value = 1

  async def destroy(self):
    pass

  async def rotate(self, valve):
    self._valve_target = valve

    while self._rotation_future:
      await self._rotation_future

    async def run():
      await asyncio.sleep(1)

      self._rotation_future = None
      self._valve_value = valve

    self._rotation_future = asyncio.ensure_future(run())
    await self._rotation_future

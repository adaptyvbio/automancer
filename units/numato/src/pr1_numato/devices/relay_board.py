import asyncio

from pr1.device import BooleanNode
import serial
import serial_asyncio

from .. import logger, namespace


class Protocol(asyncio.Protocol):
  def __init__(self, device):
    self._device = device

  def data_received(self, data):
    lines = data.split(b"\n\r")
    self._device._receive(lines[1] if len(lines) == 3 else None)

  def connection_lost(self, exc):
    self._device._lost(exc)


class RelayBoardNode(BooleanNode):
  def __init__(self, index, device):
    self.unwritable = False

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
    return str(self._index)

  @property
  def label(self):
    return f"Relay {self._index}"

  @property
  def target_value(self):
    if self._device._value_target is None:
      return None

    return (self._device._value_target & self._mask) > 0

  @property
  def value(self):
    if self._device._value is None:
      return None

    return (self._device._value & self._mask) > 0

  async def write(self, value):
    await self._device.try_write(((self._device._value_target or 0) & ~self._mask) | (int(value) << self._index))


class RelayBoardDevice:
  model = "Numato relay module"
  owner = namespace

  def __init__(self, *, address, id, label, relay_count, update_callback):
    self.connected = False
    self.id = id
    self.label = label

    self.nodes = [RelayBoardNode(index, device=self) for index in range(relay_count)]
    self._nodes_map = { node.id: node for node in self.nodes }

    self._address = address
    self._relay_count = relay_count
    self._update_callback = update_callback

    self._value = None
    self._value_target = None

    self._query_future = None
    self._reconnect_task = None

    self._protocol = None
    self._transport = None

  @property
  def _connected(self):
    return self._protocol is not None

  async def _connect(self):
    logger.debug(f"Connecting to '{self._address}'")

    try:
      self._transport, self._protocol = await serial_asyncio.create_serial_connection(
        loop=asyncio.get_running_loop(),
        protocol_factory=lambda: Protocol(device=self),
        url=self._address,
        baudrate=9600
      )
    except serial.serialutil.SerialException:
      return

    self._value = await self.read()

    if self._value_target is None:
      self._value_target = self._value

    if self._value_target != self._value:
      await self.write(self._value_target)

    self.connected = True
    logger.info(f"Connected to '{self._address}'")

  def _reconnect(self, interval = 1):
    async def reconnect():
      try:
        while True:
          await self._connect()

          if self.connected:
            self._update_callback()
            return

          await asyncio.sleep(interval)
      except asyncio.CancelledError:
        pass
      finally:
        self._reconnect_task = None

    self._reconnect_task = asyncio.create_task(reconnect())

  def _lost(self, exc):
    self.connected = False

    self._protocol = None
    self._transport = None

    if exc is not None:
      logger.error(f"Lost connection to '{self._address}'")

      self._reconnect()
      self._update_callback()

    self._query_future = None

  async def _query(self, command):
    while self._query_future:
      await self._query_future

    self._send(command)
    self._query_future = asyncio.Future()

    return await self._query_future

  def _receive(self, data):
    self._query_future.set_result(data)
    self._query_future = None

  def _send(self, command):
    self._transport.write(f"{command}\r".encode("utf-8"))


  async def initialize(self):
    await self._connect()

    if not self.connected:
      logger.error(f"Failed connecting to '{self._address}'")
      self._reconnect()

  async def destroy(self):
    if self.connected:
      self._transport.close()

    if self._reconnect_task:
      self._reconnect_task.cancel()

  @property
  def hash(self):
    return ("relay_board", self._relay_count)

  def get_node(self, id):
    return self._nodes_map.get(id)


  async def get_version(self):
    return int(await self._query("ver"))

  async def read(self):
    return int(await self._query("relay readall"), 16)

  async def write(self, value):
    self._value_target = value
    await self._query(f"relay writeall {value:08x}")
    self._value = await self.read()

  async def try_write(self, value):
    if self._connected:
      await self.write(value)
    else:
      self._value_target = value


if __name__ == "__main__":
  import logging
  logging.basicConfig(level=logging.DEBUG, format="%(levelname)-8s :: %(name)-18s :: %(message)s")

  device = RelayBoardDevice(address="/dev/tty.usbmodem1101", id="1", label="Relay Board", relay_count=32, update_callback=lambda: None)

  async def main():
    await device.initialize()

    while True:
      for i in range(2):
        await device.nodes[0].write(bool(i))
        await device.nodes[1].write(bool(1 - i))
        # await device.try_write([0b10110, 0b100101, 0b111001][i])
        await asyncio.sleep(1)

    while True:
      await asyncio.sleep(0.1)

  asyncio.run(main())

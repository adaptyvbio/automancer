import asyncio

from pr1.device import BooleanNode
from serial.serialutil import SerialException
import aioserial

from .. import logger, namespace


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

    self._check_task = None
    self._query_lock = asyncio.Lock()
    self._reconnect_task = None
    self._serial = None

  async def _connect(self):
    logger.debug(f"Connecting to '{self._address}'")

    try:
      self._serial = aioserial.AioSerial(
        baudrate=9600,
        port=self._address
      )
    except SerialException:
      return

    self._value = await self.read()

    if self._value_target is None:
      self._value_target = self._value

    if self._value_target != self._value:
      await self.write(self._value_target)

    self.connected = True
    logger.info(f"Connected to '{self._address}'")

    async def check():
      try:
        while True:
          await self.read()
          await asyncio.sleep(1)
      except (asyncio.CancelledError, SerialException):
        pass
      finally:
        self._check_task = None

    self._check_task = asyncio.create_task(check())

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

  async def _query(self, command, *, get_response = False):
    await self._query_lock.acquire()

    try:
      await self._serial.write_async(f"{command}\r".encode("utf-8"))
      await self._serial.read_until_async(b"\r")

      return (await self._serial.read_until_async(b"\r"))[0:-2] if get_response else None
    except SerialException:
      self.connected = False
      self._serial = None

      logger.error(f"Lost connection to '{self._address}'")

      self._reconnect()
      self._update_callback()

      raise
    finally:
      self._query_lock.release()


  async def initialize(self):
    await self._connect()

    if not self.connected:
      logger.error(f"Failed connecting to '{self._address}'")
      self._reconnect()

  async def destroy(self):
    await self._query_lock.acquire()

    if self._serial:
      logger.debug(f"Disconnecting from '{self._address}'")

      self._serial.close()
      self._serial = None

    if self._check_task:
      self._check_task.cancel()

    if self._reconnect_task:
      self._reconnect_task.cancel()

  @property
  def hash(self):
    return ("relay_board", self._relay_count)

  def get_node(self, id):
    return self._nodes_map.get(id)


  async def get_version(self):
    return int(await self._query("ver", get_response=True))

  async def read(self):
    return int(await self._query("relay readall", get_response=True), 16)

  async def write(self, value):
    self._value_target = value
    await self._query(f"relay writeall {value:08x}")
    self._value = await self.read()

  async def try_write(self, value):
    if self._serial:
      try:
        await self.write(value)
      except SerialException:
        pass
    else:
      self._value_target = value


if __name__ == "__main__":
  import logging
  logging.basicConfig(level=logging.DEBUG, format="%(levelname)-8s :: %(name)-18s :: %(message)s")

  device = RelayBoardDevice(address="/dev/tty.usbmodem1101", id="1", label="Relay Board", relay_count=32, update_callback=lambda: None)

  async def main():
    await device.initialize()

  asyncio.run(main())

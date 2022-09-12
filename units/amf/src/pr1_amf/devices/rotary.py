import asyncio

from serial.serialutil import SerialException
from pr1.device import SelectNode, SelectNodeOption
import aioserial

from .. import logger, namespace


class RotaryValveNode(SelectNode):
  id = "position"
  label = "Position"

  def __init__(self, device):
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
    await self._device.try_rotate(valve)


class RotaryValveDevice:
  model = "LSP rotary valve"
  owner = namespace

  def __init__(self, *, address, id, label, update_callback, valve_count):
    self.connected = False
    self.id = id
    self.label = label
    self.nodes = [
      RotaryValveNode(device=self)
    ]

    self._address = address
    self._update_callback = update_callback
    self._valve_count = valve_count

    self._valve_target = None
    self._valve_value = None

    self._busy = False
    self._busy_future = None
    self._query_futures = list()
    self._read_task = None
    self._reconnect_task = None
    self._serial = None

  async def _connect(self):
    logger.debug(f"Connecting to '{self._address}'")

    try:
      self._serial = aioserial.AioSerial(
        port=self._address,
        baudrate=9600
      )
    except SerialException:
      return

    async def read_loop():
      try:
        while True:
          self._receive((await self._serial.read_until_async(b"\n"))[0:-2])
      except asyncio.CancelledError:
        pass
      except SerialException as e:
        self._lost(e)
      finally:
        self._read_task = None

    self._read_task = asyncio.create_task(read_loop())

    # Set the output mode to 2
    # This will also set self._busy to its correct value
    await self._query("!502")

    if self._busy:
      self._busy_future = asyncio.Future()

    if (await self.get_valve_count()) != self._valve_count:
      raise Exception("Invalid valve count")

    valve_value = await self.get_valve()

    if valve_value == 0:
      await self.home()
      valve_value = await self.get_valve()

    self._valve_value = valve_value
    self.connected = True

    if self._valve_target is None:
      self._valve_target = self._valve_value

    if self._valve_value != self._valve_target:
      await self.rotate(self._valve_target)

    logger.info(f"Connected to '{self._address}'")


  def _reconnect(self, interval = 1):
    async def reconnect_loop():
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

    self._reconnect_task = asyncio.create_task(reconnect_loop())

  async def _query(self, command, dtype = None):
    future = asyncio.Future()
    self._query_futures.append(future)

    await self._serial.write_async(f"/_{command}\r".encode("utf-8"))
    return self._parse(await future, dtype=dtype)

  def _lost(self, exc):
    logger.error(f"Lost connection to '{self._address}'")

    self.connected = False
    self._serial = None

    if self._read_task:
      self._read_task.cancel()

    if self._busy_future:
      self._busy_future.set_exception(exc)
      self._busy_future = None

    for future in self._query_futures:
      future.set_exception(exc)

    self._query_futures.clear()

    self._reconnect()
    self._update_callback()

  def _parse(self, data, dtype = None):
    response = data[3:-1].decode("utf-8")

    if dtype == bool:
      return (response == "1")
    if dtype == int:
      return int(response)

    return response

  def _receive(self, data):
    was_busy = self._busy
    self._busy = (data[2] & (1 << 5)) < 1

    if self._busy_future and was_busy and (not self._busy):
      self._busy_future.set_result(data)
      self._busy_future = None
    else:
      query_future, *self._query_futures = self._query_futures
      query_future.set_result(data)

  async def _run(self, command):
    while self._busy_future:
      await self._busy_future

    future = asyncio.Future()
    self._busy_future = future

    await self._query(command)
    await future


  async def initialize(self):
    await self._connect()

    if not self.connected:
      logger.error(f"Failed connecting to '{self._address}'")
      self._reconnect()

  async def destroy(self):
    if self._serial:
      logger.debug(f"Disconnecting from '{self._address}'")

      self._serial.close()
      self._serial = None

    if self._read_task:
      self._read_task.cancel()

    if self._reconnect_task:
      self._reconnect_task.cancel()

  @property
  def hash(self):
    return ("rotary_valve", self._valve_count)


  async def get_unique_id(self):
    return await self._query("?9000")

  async def get_valve(self):
    return await self._query("?6", dtype=int)

  async def get_valve_count(self):
    return await self._query("?801", dtype=int)

  async def home(self):
    await self._run("ZR")

  async def rotate(self, valve):
    self._valve_target = valve
    await self._run(f"b{valve}R")
    self._valve_value = await self.get_valve()

  async def try_rotate(self, valve):
    if self.connected:
      await self.rotate(valve)
    else:
      self._valve_target = valve

  async def wait(self, delay):
    await self._run(f"M{round(delay * 1000)}R")

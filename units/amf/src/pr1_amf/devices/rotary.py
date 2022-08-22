import asyncio

import serial
import serial_asyncio

from .. import logger, namespace


class Protocol(asyncio.Protocol):
  def __init__(self, device):
    self._buffer = bytes()
    self._device = device

  def data_received(self, data):
    self._buffer += data

    *lines, self._buffer = self._buffer.split(b"\r\n")

    for line in lines:
      self._device._receive(line)

  def connection_lost(self, exc):
    self._device._lost(exc)


class RotaryValveDevice:
  model = "LSP rotary valve"
  owner = namespace

  def __init__(self, *, address, id, label, update_callback):
    self.id = id
    self.label = label
    self.nodes = list()

    self._address = address
    self._update_callback = update_callback

    self._busy = False
    self._busy_future = None
    self._query_futures = list()
    self._reconnect_task = None

    self._valve_target = None
    self._valve_value = None

    self._protocol = None
    self._transport = None

  @property
  def connected(self):
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

    # Set the output mode to 2
    # This will also set self._busy to its correct value
    await self._query("!502")

    if self._busy:
      self._busy_future = asyncio.Future()

    self._valve_value = await self.get_valve()

    if self._valve_target is None:
      self._valve_target = self._valve_value

    if self._valve_value != self._valve_target:
      await self.rotate(self._valve_target)

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

  async def _query(self, command, dtype = None):
    if not self.connected:
      raise Exception("Not connected")

    future = asyncio.Future()
    self._query_futures.append(future)
    self._send(command)

    return self._parse(await future, dtype=dtype)

  def _lost(self, exc):
    self._protocol = None
    self._transport = None

    self._valve_value = None

    if exc is not None:
      logger.error(f"Lost connection to '{self._address}'")

      if self._busy_future:
        self._busy_future.set_exception(exc)

      for future in self._query_futures:
        future.set_exception(exc)

      self._reconnect()

    self._busy_future = None
    self._query_futures.clear()

  def _parse(self, data, dtype = None):
    response = data[3:-1].decode("utf-8")
    print(f"Status: {data[2]:08b}")

    if dtype == bool:
      return (response == "1")
    if dtype == int:
      return int(response)

    return response

  def _receive(self, data):
    print(">>", data)

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

  def _send(self, command):
    self._transport.write(f"/_{command}\r".encode("utf-8"))


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

  async def wait(self, delay):
    await self._run(f"M{round(delay * 1000)}R")

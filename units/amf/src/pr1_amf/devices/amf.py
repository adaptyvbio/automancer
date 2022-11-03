import asyncio
import builtins
import traceback
from typing import Awaitable, Callable, Optional, overload

from aioserial import AioSerial
from serial.serialutil import SerialException


Datatype = type[bool] | type[int]

class AMFRotaryValveDeviceDisconnectedError(Exception):
  pass

class AMFRotaryValveDevice:
  def __init__(self, address: str, *, on_close: Optional[Callable[..., Awaitable[None]]] = None):
    self._on_close = on_close

    try:
      self._serial = AioSerial(
        baudrate=9600,
        port=address
      )
    except SerialException as e:
      raise AMFRotaryValveDeviceDisconnectedError() from e

    self._busy = False
    self._busy_future: Optional[asyncio.Future] = None
    self._closing = False
    self._query_futures = list()
    self._read_task: Optional[asyncio.Task] = None

    async def read_loop():
      try:
        while True:
          assert self._serial
          self._receive((await self._serial.read_until_async(b"\n"))[0:-2])
      except asyncio.CancelledError:
        pass
      except SerialException as e:
        self._lost(e)
      except Exception:
        traceback.print_exc()
      finally:
        self._read_task = None

    self._read_task = asyncio.create_task(read_loop())

  async def close(self):
    if self._closing:
      raise AMFRotaryValveDeviceDisconnectedError()

    self._closing = True
    await asyncio.wait(self._query_futures + ([self._busy_future] if self._busy_future else list()))

    self._serial.close()

    if self._read_task:
      self._read_task.cancel()

    if self._on_close:
      await self._on_close(lost=False)

  def _lost(self, exc: Exception):
    if self._busy_future:
      self._busy_future.set_exception(exc)

    for future in self._query_futures:
      future.set_exception(exc)

    if not self._closing:
      self._closing = True

      if self._read_task:
        self._read_task.cancel()

      if self._on_close:
        self._on_close(lost=True)

  @overload
  async def _query(self, command: str, dtype: type[bool]) -> bool:
    pass

  @overload
  async def _query(self, command: str, dtype: type[int]) -> int:
    pass

  @overload
  async def _query(self, command: str, dtype = None) -> str:
    pass

  async def _query(self, command: str, dtype: Optional[type[bool] | type[int]] = None):
    if self._closing:
      raise AMFRotaryValveDeviceDisconnectedError()

    future = asyncio.Future()
    self._query_futures.append(future)

    try:
      await self._serial.write_async(f"/_{command}\r".encode("utf-8"))
    except SerialException as e:
      self._lost(e)
      raise AMFRotaryValveDeviceDisconnectedError() from e
    else:
      return self._parse(await future, dtype=dtype)

  def _parse(self, data: bytes, dtype: Optional[Datatype] = None):
    response = data[3:-1].decode("utf-8")

    match dtype:
      case builtins.bool:
        return (response == "1")
      case builtins.int:
        return int(response)
      case _:
        return response

  def _receive(self, data: bytes):
    was_busy = self._busy
    self._busy = (data[2] & (1 << 5)) < 1

    if self._busy_future and was_busy and (not self._busy):
      self._busy_future.set_result(data)
      self._busy_future = None
    else:
      query_future, *self._query_futures = self._query_futures
      query_future.set_result(data)

  async def _run(self, command: str):
    if self._closing:
      raise AMFRotaryValveDeviceDisconnectedError()

    while self._busy_future:
      await self._busy_future

    future = asyncio.Future()
    self._busy_future = future

    await self._query(command)
    await future

  async def get_unique_id(self):
    return await self._query("?9000")

  async def get_valve(self):
    return await self._query("?6", dtype=int)

  async def get_valve_count(self):
    return await self._query("?801", dtype=int)

  async def home(self):
    await self._run("ZR")

  async def rotate(self, valve: int):
    await self._run(f"b{valve}R")

  async def wait(self, delay: float):
    await self._run(f"M{round(delay * 1000)}R")


  @staticmethod
  async def list():
    return []

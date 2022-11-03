import asyncio
from typing import Awaitable, Callable, Literal, Optional, Sequence, overload

import serial.tools.list_ports
from aioserial import AioSerial
from serial.serialutil import SerialException


class NumatoRelayBoardDeviceDisconnectedError(Exception):
  pass

class NumatoRelayBoardDeviceInfo:
  def __init__(self, *, address: str):
    self.address = address

  def create(self, **kwargs):
    return NumatoRelayBoardDevice(self.address, **kwargs)


class NumatoRelayBoardDevice:
  def __init__(self, address: str, *, on_close: Optional[Callable[..., Awaitable[None]]] = None):
    self._lock = asyncio.Lock()
    self._on_close = on_close
    self._serial: Optional[AioSerial] = AioSerial(
      baudrate=9600,
      port=address
    )

  async def close(self):
    await self._lock.acquire()

    if not self._serial:
      raise NumatoRelayBoardDeviceDisconnectedError()

    self._serial.close()
    self._serial = None

    if self._on_close:
      await self._on_close(lost=False)

    self._lock.release()

  @overload
  async def _request(self, command, *, get_response: Literal[True]) -> str:
    pass

  @overload
  async def _request(self, command, *, get_response: Literal[False] = False) -> None:
    pass

  async def _request(self, command, *, get_response = False):
    await self._lock.acquire()

    if not self._serial:
      raise NumatoRelayBoardDeviceDisconnectedError()

    try:
      await self._serial.write_async(f"{command}\r".encode("ascii"))
      await self._serial.read_until_async(b"\r")

      return (await self._serial.read_until_async(b"\r"))[0:-2].decode("ascii") if get_response else None
    except SerialException as e:
      self._serial = None

      if self._on_close:
        await self._on_close(lost=True)

      raise NumatoRelayBoardDeviceDisconnectedError() from e
    finally:
      self._lock.release()

  async def get_id(self):
    return await self._request("id get", get_response=True)

  async def set_id(self, value: str):
    assert len(value) == 8
    await self._request(f"id set {value}")

  async def get_version(self):
    return int(await self._request("ver", get_response=True))

  async def read(self):
    return int(await self._request("relay readall", get_response=True), 16)

  async def write(self, value: int):
    await self._request(f"relay writeall {value:08x}")
    self._value = await self.read()


  @staticmethod
  def list(*, all = False) -> Sequence[NumatoRelayBoardDeviceInfo]:
    infos = serial.tools.list_ports.comports()
    return [NumatoRelayBoardDeviceInfo(address=info.device) for info in infos if all or (info.vid, info.pid) == (0x03eb, 0x2404)]


# if __name__ == "__main__":
#   import logging
#   logging.basicConfig(level=logging.DEBUG, format="%(levelname)-8s :: %(name)-18s :: %(message)s")

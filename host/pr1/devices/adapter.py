import asyncio
import traceback
from typing import Any, Awaitable, Callable, Generic, Optional, Protocol, Sequence, TypeVar, cast

from serial.serialutil import SerialException


class GeneralDeviceInfo(Protocol):
  def __init__(self):
    self.address: str

  # @staticmethod
  # def create() -> 'GeneralDevice':
  #   raise NotImplementedError()

class GeneralDevice(Protocol):
  def __init__(self, address: str, *, on_close: Optional[Callable[..., Awaitable[None]]] = None):
    pass

  async def close(self):
    raise NotImplementedError()

  async def get_serial_number(self) -> Optional[str]:
    raise NotImplementedError()

  @staticmethod
  def list(*, all = False) -> Any: # Sequence[GeneralDeviceInfo]:
    raise NotImplementedError()


T = TypeVar('T', bound=GeneralDevice)

class GeneralDeviceAdapter(Generic[T]):
  def __init__(
    self,
    Device: type[T],
    *,
    address: Optional[str] = None,
    on_connection: Optional[Callable] = None,
    on_connection_fail: Optional[Callable] = None,
    on_disconnection: Optional[Callable] = None,
    reconnect: bool = True,
    serial_number: Optional[str] = None
  ):
    self._Device = Device

    self._address = address
    self._serial_number = serial_number

    self._device: Optional[T] = None
    self._reconnect_task = None

    self._on_connection = on_connection
    self._on_connection_fail = on_connection_fail
    self._on_disconnection = on_disconnection

    self.connected = False
    self.reconnect_device = reconnect

  @property
  def device(self):
    if not self.connected:
      raise Exception("Disconnected device")

    return cast(T, self._device)


  async def _connect(self):
    if self._address is not None:
      await self._connect_address(self._address)
    else:
      for info in self._Device.list():
        await self._connect_address(info.address)

        if self.connected:
          break

    return self.connected

  async def _connect_address(self, address: str):
    async def on_close(*, lost: bool):
      if lost:
        self.connected = False
        self._device = None

        if self._on_disconnection:
          await self._on_disconnection(lost=lost)

        if self.reconnect_device:
          self.reconnect()

    try:
      self._device = self._Device(address, on_close=on_close)
      serial_number = await asyncio.wait_for(self._device.get_serial_number(), timeout=1)
    except (asyncio.TimeoutError, SerialException):
      self._device = None
    else:
      if (self._serial_number is None) or (serial_number == self._serial_number):
        self.connected = True
      else:
        self._device = None


  async def connect(self):
    connected = await self._connect()

    if connected and self._on_connection:
      await self._on_connection(reconnection=False)
    if (not connected) and self._on_connection_fail:
      await self._on_connection_fail(reconnection=False)

    return connected

  def reconnect(self, *, initial_wait = False, interval = 1):
    async def reconnect_loop():
      try:
        if initial_wait:
          await asyncio.sleep(interval)

        while True:
          if await self._connect():
            if self._on_connection:
              await self._on_connection(reconnection=True)
            return
          elif self._on_connection_fail:
            await self._on_connection_fail(reconnection=True)

          await asyncio.sleep(interval)
      except asyncio.CancelledError:
        pass
      except Exception:
        traceback.print_exc()
      finally:
        self._reconnect_task = None

    self._reconnect_task = asyncio.create_task(reconnect_loop())
    return self._reconnect_task

  async def start(self):
    if not await self.connect():
      self.reconnect(initial_wait=True)

  async def stop(self):
    if self._device:
      await self._device.close()

      self.connected = False
      self._device = None

      if self._on_disconnection:
        await self._on_disconnection(lost=False)

    if self._reconnect_task:
      self._reconnect_task.cancel()

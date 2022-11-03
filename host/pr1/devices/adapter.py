import asyncio
import traceback
from typing import Any, Awaitable, Callable, Generic, Optional, Protocol, Sequence, TypeVar, cast

from serial.serialutil import SerialException


class GeneralDeviceInfo(Protocol):
  def __init__(self):
    self.address: str

class GeneralDevice(Protocol):
  def __init__(self, address: str, *, on_close: Optional[Callable[..., Awaitable[None]]] = None):
    pass

  async def close(self) -> None:
    raise NotImplementedError()


T = TypeVar('T', bound=GeneralDevice)

class GeneralDeviceAdapterController(Protocol, Generic[T]):
  async def create_device(self, address: str, *, on_close: Callable) -> Optional[T]:
    raise NotImplementedError()

  async def list_devices(self) -> Sequence[GeneralDeviceInfo]:
    raise NotImplementedError()

  async def test_device(self, device: T) -> bool:
    raise NotImplementedError()

  async def on_connection(self, *, reconnection: bool):
    pass

  async def on_connection_fail(self, *, reconnection: bool):
    pass

  async def on_disconnection(self, *, lost: bool):
    pass


class GeneralDeviceAdapter(Generic[T]):
  def __init__(
    self,
    *,
    address: Optional[str] = None,
    controller: GeneralDeviceAdapterController[T],
    reconnect: bool = True
  ):
    self._address = address
    self._controller = controller

    self._configured = False
    self._device: Optional[T] = None
    self._reconnect_task = None

    self.connected = False
    self.reconnect_device = reconnect


  # Internal methods

  async def _connect(self):
    if self._address is not None:
      await self._connect_address(self._address)
    else:
      for info in await self._controller.list_devices():
        await self._connect_address(info.address)

        if self.connected:
          break

  async def _connect_address(self, address: str):
    async def on_close(*, lost: bool):
      if self.connected and lost:
        self.connected = False
        self._device = None

        if self._configured:
          self._configured = False
          await self._controller.on_disconnection(lost=lost)

        if self.reconnect_device:
          self.reconnect()

    try:
      self._device = await asyncio.wait_for(self._controller.create_device(address, on_close=on_close), timeout=1.0)

      if self._device and not await asyncio.wait_for(self._controller.test_device(self._device), timeout=1.0):
        self._device = None
    except asyncio.TimeoutError:
      self._device = None

    if self._device:
      self.connected = True


  # Public methods

  @property
  def device(self):
    if not self.connected:
      raise Exception("Disconnected device")

    return cast(T, self._device)


  async def connect(self):
    await self._connect()

    if self.connected:
      # If on_connection() calls a method on the device that detects a disconnection,
      # that method will call on_close() which will set self.connected to False.
      await self._controller.on_connection(reconnection=False)

    if self.connected:
      self._configured = True
    else:
      await self._controller.on_connection_fail(reconnection=False)

    return self.connected

  def reconnect(self, *, initial_wait = False, interval = 1):
    async def reconnect_loop():
      try:
        if initial_wait:
          await asyncio.sleep(interval)

        while True:
          if await self._connect():
            await self._controller.on_connection(reconnection=True)
            return

          await self._controller.on_connection_fail(reconnection=True)

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
    # TODO: Acquire a lock here to make sure the device is not being initialized.

    if self._device:
      await self._device.close()

      self.connected = False
      self._device = None

      await self._controller.on_disconnection(lost=False)

    if self._reconnect_task:
      self._reconnect_task.cancel()

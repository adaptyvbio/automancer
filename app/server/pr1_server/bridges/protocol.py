from abc import ABC, abstractmethod
from dataclasses import dataclass
from ipaddress import IPv4Address
from typing import Any, AsyncGenerator, Callable, Coroutine, Protocol


class ClientClosed(Exception):
  pass

class BaseClient(ABC):
  def __init__(self):
    self.id: str
    self.privileged: bool
    self.remote: bool

  @abstractmethod
  async def recv(self) -> Any:
    ...

  @abstractmethod
  async def send(self, message: object):
    ...

  def __aiter__(self):
    return self

  async def __anext__(self):
    return await self.recv()


@dataclass
class BridgeAdvertisementInfo:
  address: IPv4Address
  port: int
  type: str

class BridgeProtocol(Protocol):
  def advertise(self) -> list[BridgeAdvertisementInfo]:
    return list()

  def export_info(self) -> list:
    return list()

  async def start(self, handle_client: Callable[[BaseClient], Coroutine]) -> AsyncGenerator[Any, None]:
    ...

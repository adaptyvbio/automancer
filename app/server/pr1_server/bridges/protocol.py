from abc import ABC, abstractmethod
from asyncio import Task
from dataclasses import dataclass
from typing import Any, Callable, Coroutine, Protocol


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
  address: str
  port: int
  type: str

class BridgeProtocol(Protocol):
  def advertise(self) -> list[BridgeAdvertisementInfo]:
    return list()

  async def initialize(self):
    ...

  async def start(self, handle_client: Callable[[BaseClient], Coroutine]):
    ...

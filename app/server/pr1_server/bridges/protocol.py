from asyncio import Task
from typing import Any, Callable, Coroutine, Protocol


class ClientClosed(Exception):
  pass

class ClientProtocol(Protocol):
  def __init__(self):
    self.id: str
    self.privileged: bool
    self.remote: bool

  def close(self):
    ...

  async def recv(self) -> Any:
    ...

  async def send(self, message: object):
    ...

  def __aiter__(self):
    return self

  async def __anext__(self):
    return await self.recv()


class BridgeProtocol(Protocol):
  async def initialize(self):
    ...

  async def start(self, handle_client: Callable[[ClientProtocol], Coroutine]):
    ...

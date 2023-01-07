from typing import Any


class ClientClosed(Exception):
  pass

class BaseClient:
  def __init__(self):
    self.id: str
    self.priviledged: bool
    self.remote: bool

    self.sessions = dict()

  def close(self):
    ...

  async def recv(self) -> bytes:
    ...

  async def send(self, message: object):
    ...

  def __aiter__(self):
    return self

  async def __anext__(self):
    return await self.recv()

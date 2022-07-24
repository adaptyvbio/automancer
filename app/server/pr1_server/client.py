class ClientClosed(Exception):
  pass

class BaseClient:
  def __init__(self):
    self.sessions = dict()

  def __aiter__(self):
    return self

  async def __anext__(self):
    return await self.recv()

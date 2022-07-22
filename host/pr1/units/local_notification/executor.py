from ..base import BaseExecutor


class Executor(BaseExecutor):
  def __init__(self, conf, *, host):
    self._host = host

  async def initialize(self):
    pass

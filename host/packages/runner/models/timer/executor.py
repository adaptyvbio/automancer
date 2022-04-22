from lib2to3.pytree import Base
from .runner import Runner
from ..base import BaseExecutor


class Executor(BaseExecutor):
  def create_runner(self, chip):
    return Runner(self, chip)

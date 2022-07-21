import sys

from . import logger
from .model import Model
from ..base import BaseExecutor
from ...reader import LocatedError


class Executor(BaseExecutor):
  def __init__(self, _conf, *, host):
    self.host = host
    self.models = dict()

  async def initialize(self):
    logger.debug("Loading models")

    for path in (self.host.data_dir / "models").glob("**/*.yml"):
      try:
        model = Model.load(path)
        self.models[model.id] = model

        # from pprint import pprint
        # pprint(model.export())
      except LocatedError as e:
        e.display()
        sys.exit(1)

    logger.debug(f"Done loading {len(self.models)} models")

  def export(self):
    return {
      "models": {
        model.id: model.export() for model in self.models.values()
      }
    }

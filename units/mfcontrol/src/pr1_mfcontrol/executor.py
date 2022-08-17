from pr1.units.base import BaseExecutor
from pr1.util import schema as sc
from pr1.util.parser import Identifier, IdentifierPath
from pr1.util.misc import log_exception

from . import logger
from .model import Model


schema = sc.Schema({
  'valves': sc.List({
    'id': Identifier(),
    'location': IdentifierPath(length=2)
  })
})

class Executor(BaseExecutor):
  def __init__(self, conf, *, host):
    conf = schema.transform(conf)

    self._conf = conf
    self._host = host

    self.models = dict()
    self._valves = None

  async def initialize(self):
    self._valves = dict()

    for valve in self._conf['valves']:
      valve_location = valve['location']
      valve_id = valve['id']

      device = self._host.devices.get(valve_location[0])

      if not device:
        raise valve_location[0].error(f"Missing device")

      node = device.get_node(valve_location[1])

      if node is None:
        raise valve_location[1].error(f"Missing node")

      if valve_id in self._valves:
        raise valve_id.error(f"Duplicate valve id '{valve_id}'")

      self._valves[valve_id] = node

    logger.debug("Loading models")

    for path in (self._host.data_dir / "models").glob("**/*.yml"):
      try:
        model = Model.load(path)
      except Exception:
        logger.error(f"Failed to load model at '{path}'")
        log_exception(logger)
        continue

      if model.id in self.models:
        raise model.id.error(f"Duplicate model with id '{model.id}'")

      self.models[model.id] = model

    logger.debug(f"Loaded {len(self.models)} models")

  def export(self):
    return {
      "models": {
        model.id: model.export() for model in self.models.values()
      },
      "valves": {
        valve_id: valve_index for valve_index, valve_id in enumerate(self._valves.keys())
      }
    }

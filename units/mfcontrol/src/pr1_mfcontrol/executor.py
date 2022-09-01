import functools
import json
from collections import namedtuple

from pr1.units.base import BaseExecutor
from pr1.util import schema as sc
from pr1.util.misc import fast_hash, log_exception
from pr1.util.parser import Identifier, IdentifierPath

from . import logger
from .model import Model


Valve = namedtuple("Valve", ['label', 'node'])

schema = sc.Schema({
  'valves': sc.Optional(sc.List({
    'label': sc.Optional(Identifier()),
    'location': IdentifierPath(length=2)
  }))
})

class Executor(BaseExecutor):
  def __init__(self, conf, *, host):
    conf = schema.transform(conf)

    self._conf = conf
    self._host = host

    self.models = dict()
    self.valves = None

  async def initialize(self):
    self.valves = list()

    for valve_conf in self._conf.get('valves', list()):
      valve_location = valve_conf['location']

      device = self._host.devices.get(valve_location[0])

      if not device:
        raise valve_location[0].error(f"Missing device")

      node = device.get_node(valve_location[1])

      if node is None:
        raise valve_location[1].error(f"Missing node")

      self.valves.append(Valve(
        label=(valve_conf['label'] or valve_location),
        node=node
      ))

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
      "valves": [
        { "label": valve.label } for valve in self.valves
      ]
    }

  @functools.cached_property
  def hash(self):
    return fast_hash(json.dumps((
      [model.hash for model in self.models.values()],
      [valve.label for valve in self.valves]
    )))

import pickle
from collections import namedtuple

from pr1.units.base import BaseRunner

from . import logger, namespace


Voice = namedtuple("Voice", ["locale", "name"])

class Runner(BaseRunner):
  def __init__(self, chip, *, host):
    self._chip = chip
    self._executor = host.executors[namespace]
    self._matrix = chip.matrices[namespace]

  async def command(self, data):
    self._chip.push_process(namespace, pickle.dumps({ 'message': data["message"] }))
    await self._executor.run(data["message"], voice=self._matrix.voice)

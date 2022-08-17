import pickle
from collections import namedtuple

from pr1.units.base import BaseRunner

from . import logger, namespace


Voice = namedtuple("Voice", ["locale", "name"])

class Runner(BaseRunner):
  def __init__(self, *, chip, host):
    self._chip = chip
    self._host = host

    self._executor = host.executors[namespace]
    self._voice = None

  async def command(self, data):
    if data["type"] == "setVoice":
      self._voice = data["value"]
      self._chip.update_runners(namespace)

    if data["type"] == "run":
      self._chip.push_process(namespace, pickle.dumps({ 'message': data["message"] }))
      await self._executor.run(data["message"], voice=self._voice)

  def create(self):
    voices = self._host.executors[namespace]._voices
    self._voice = next(voice for voice in voices if voice.locale == "en_US").name

  def export(self):
    return {
      "voice": self._voice
    }

  def serialize(self):
    return (self._voice, )

  def unserialize(self, state):
    voice, = state
    self._voice = voice

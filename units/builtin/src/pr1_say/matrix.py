from pr1.units.base import BaseMatrix

from . import logger, namespace


class Matrix(BaseMatrix):
  def __init__(self, *, chip, host):
    self._chip = chip
    self._host = host

    self._voice = None

  @property
  def voice(self):
    return self._voice

  def create(self):
    voices = self._host.executors[namespace]._voices
    self._voice = next(voice for voice in voices if voice.locale == "en_US").name

  def export(self):
    return {
      "voice": self._voice
    }

  def update(self, data):
    self._voice = data["voice"]

  def serialize(self):
    return (self._voice, )

  def unserialize(self, state):
    voice, = state
    self._voice = voice

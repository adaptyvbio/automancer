from pr1.units.base import BaseMatrix

from . import logger, name


class Matrix(BaseMatrix):
  def __init__(self):
    self._chip = None
    self._host = None

    self._voice = None

  def attach(self, *, chip, host):
    self._chip = chip
    self._host = host

  def create(self):
    voices = self._host.executors[name]._voices
    self._voice = next(voice for voice in voices if voice.locale == "en_US").name

  def export(self):
    return {
      "voice": self._voice
    }

  def update(self, data):
    self._voice = data["voice"]

  def __getstate__(self):
    return (self._voice, )

  def __setstate__(self, state):
    voice, = state
    self._voice = voice

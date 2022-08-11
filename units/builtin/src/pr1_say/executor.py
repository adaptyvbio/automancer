import asyncio
from collections import namedtuple
from pr1.units.base import BaseExecutor

from . import logger


Voice = namedtuple("Voice", ["locale", "name"])

class Executor(BaseExecutor):
  def __init__(self, conf, *, host):
    self._voices = None

  async def initialize(self):
    proc = await asyncio.create_subprocess_shell("say -v ?", stderr=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE)
    stdout, stderr = await proc.communicate()

    if proc.returncode == 0:
      self._voices = list()

      for line in stdout.decode("utf-8")[0:-1].split("\n"):
        line = line[0:line.index("#")].rstrip()
        locale_index = line.rindex(" ")

        name = line[0:locale_index].rstrip()
        locale = line[(locale_index + 1):]

        self._voices.append(Voice(locale=locale, name=name))

      logger.debug(f"Found {len(self._voices)} voices")
    else:
      logger.error("Failed to get voice list")

      if stderr:
        logger.error(repr(stderr.decode("utf-8")))

  async def run(self, message):
    logger.debug(f"Saying '{message}'")

    proc = await asyncio.create_subprocess_shell(f"say '{message}'")
    await proc.wait()

    if proc.returncode != 0:
      raise Exception("Failed to run say")

  def export(self):
    return {
      "voices": [
        {
          "locale": voice.locale,
          "name": voice.name
        } for voice in self._voices
      ] if self._voices else None
    }

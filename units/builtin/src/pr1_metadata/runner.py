import re
import time

from pr1.chip import UnsupportedChipRunnerError
from pr1.units.base import BaseRunner

from . import namespace


class Runner(BaseRunner):
  _data_version = 1

  def __init__(self, *, chip, host):
    self._chip = chip
    self._host = host

    self._archived = None
    self._creation_date = None
    self._description = None
    self._title = None

  async def command(self, data):
    if data["type"] == "set":
      self._archived = data["archived"]
      self._description = data["description"]
      self._title = data["title"]
      self._chip.update_runners(namespace)

  def create(self):
    self._archived = False
    self._creation_date = time.time() * 1000
    self._description = str()
    self._title = "Untitled chip"

  def duplicate(self, other):
    self._archived = False
    self._creation_date = time.time() * 1000
    self._description = other._description

    match = re.search(r"\(copy(?: (\d+))?\)$", other._title)

    if match:
      count = int(match.group(1) or 0) + 1
      start = match.start(0)
      self._title = other._title[0:start] + f" (copy {count})"
    else:
      self._title = other._title + " (copy)"


  def export(self):
    return {
      "archived": self._archived,
      "creationDate": self._creation_date,
      "description": self._description,
      "title": self._title
    }

  def serialize(self):
    return self._data_version, (self._archived, self._creation_date, self._description, self._title)

  def unserialize(self, state):
    version, data = state

    if version != self._data_version:
      raise UnsupportedChipRunnerError()

    self._archived, self._creation_date, self._description, self._title = data

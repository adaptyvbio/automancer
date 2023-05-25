import pickle
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, NewType, Optional

if TYPE_CHECKING:
  from .fiber.master2 import Master


ExperimentId = NewType('ExperimentId', str)

@dataclass
class Experiment:
  creation_time: float = field(default_factory=time.time, init=False)
  id: ExperimentId # = field(default_factory=lambda: ExperimentId(str(uuid.uuid4())), init=False)
  archived: bool = field(default=False, init=False)
  master: 'Optional[Master]' = field(default=None, init=False)
  path: Path
  title: str

  def __post_init__(self):
    self.path.mkdir(parents=True)

  def export(self):
    return {
      "id": self.id,
      "creationDate": (self.creation_time * 1000),
      "master": self.master and self.master.export(),
      "title": self.title
    }

  def save(self):
    with (self.path / "experiment.pickle").open("wb") as file:
      pickle.dump(self, file)

  @staticmethod
  def try_unserialize(path: Path, /) -> 'Optional[Experiment]':
    try:
      with (path / "experiment.pickle").open("rb") as file:
        return pickle.load(file)
    except:
      return None

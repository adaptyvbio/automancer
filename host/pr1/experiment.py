import comserde
import functools
import pickle
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, NewType, Optional

if TYPE_CHECKING:
  from .fiber.master2 import Master


ExperimentId = NewType('ExperimentId', str)


class ExperimentReportReader:
  def __init__(self, path: Path, /):
    from .report import ExperimentReportHeader

    self._path = path

    with self._get_file() as file:
      self.header: ExperimentReportHeader = comserde.load(file, ExperimentReportHeader)
      self._header_size = file.tell()

  def _get_file(self):
    return self._path.open("rb")


@dataclass(kw_only=True)
class Experiment:
  archived: bool = field(default=False, init=False)
  creation_time: float = field(default_factory=time.time, init=False)
  id: ExperimentId
  has_report: bool = field(default=False, init=False) # TODO: Make sure this is not serialized
  master: 'Optional[Master]' = field(default=None, init=False)
  path: Path
  title: str

  def __post_init__(self):
    self.path.mkdir(parents=True)
    self.has_report = self.report_path.exists()

  @property
  def report_path(self):
    return (self.path / "execution.dat")

  @functools.cached_property
  def report_reader(self):
    return ExperimentReportReader(self.report_path)

  def export(self):
    return {
      "id": self.id,
      "creationDate": (self.creation_time * 1000),
      "hasReport": self.has_report,
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

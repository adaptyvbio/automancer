import itertools
from pprint import pprint
import sys
import comserde
import functools
import pickle
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, NewType, Optional, Self

from .master.analysis import MasterAnalysis

from .util.misc import Exportable, HierarchyNode, IndexCounter
from .history import TreeAdditionChange, TreeChange, TreeRemovalChange, TreeUpdateChange

if TYPE_CHECKING:
  from .fiber.master2 import Master




EventIndex = NewType('EventIndex', int)

@dataclass
class ReportStaticEntry:
  access_count: int = 0
  accesses: list[tuple[EventIndex, Optional[EventIndex]]] = field(default_factory=list)
  children: dict[int, Self] = field(default_factory=dict)

  def export(self):
    return {
      "accessCount": self.access_count,
      "accesses": self.accesses,
      "children": {
        child_id: child.export() for child_id, child in self.children.items()
      }
    }


class ExperimentReportReader:
  def __init__(self, path: Path, /):
    from .report import ExperimentReportHeader, ExperimentReportEvent

    self._path = path


    with self._get_file() as file:
      self.header: ExperimentReportHeader = comserde.load(file, ExperimentReportHeader)
      self._header_size = file.tell()


      entries = dict[int, ReportEntry]()
      entry_counter = IndexCounter(start=1)

      self.master_analysis = MasterAnalysis()
      self.root_static_entry = ReportStaticEntry()

      entries[0] = ReportEntry(
        index=0,
        location=None,
        static_counterpart=self.root_static_entry
      )

      for event_index in itertools.count():
        try:
          event: ExperimentReportEvent = comserde.load(file, ExperimentReportEvent)
        except comserde.DeserializationError:
          break

        if event.analysis:
          self.master_analysis += event.analysis

        for change in event.changes:
          match change:
            case TreeAdditionChange():
              parent_entry = entries[change.parent_index]

              entry_index = entry_counter.new()
              entry = ReportEntry(
                index=entry_index,
                location=change.location,
                static_counterpart=parent_entry.static_counterpart.children.setdefault(change.block_child_id, ReportStaticEntry())
              )

              if entry.static_counterpart.access_count < 20:
                entry.static_counterpart.accesses.append((EventIndex(event_index), None))

              entry.static_counterpart.access_count += 1

              entries[entry_index] = entry
              parent_entry.children[change.block_child_id] = entry
              entry.parent = (parent_entry, change.block_child_id)
            case TreeUpdateChange():
              entries[change.index].location = change.location
            case TreeRemovalChange():
              entry = entries[change.index]
              entry.static_counterpart.accesses[-1] = (entry.static_counterpart.accesses[-1][0], EventIndex(event_index))

              del entries[change.index]

              if entry.parent:
                del entry.parent[0].children[entry.parent[1]]

              entry_counter.delete(change.index)

        if 1 in entries:
          print(entries[1].format_hierarchy())
          print()

      pprint(self.root_static_entry)

  def _get_file(self):
    return self._path.open("rb")

  def export(self):
    return {
      **self.header.export(),
      "masterAnalysis": self.master_analysis.export(),
      "rootStaticEntry": self.root_static_entry.children[0].export()
    }


@dataclass(kw_only=True)
class ReportEntry(Exportable, HierarchyNode):
  children: dict[int, Self] = field(default_factory=dict)
  index: int
  location: Optional[Exportable] = None
  parent: Optional[tuple[Self, int]] = None
  static_counterpart: ReportStaticEntry

  def __get_node_name__(self):
    return f"[{self.index}] " + (f"\x1b[37m{self.location!r}\x1b[0m" if self.location else "<no change>")

  def __get_node_children__(self):
    return self.children.values()

  def export(self):
    assert self.location

    location_exported = self.location.export()
    assert isinstance(location_exported, dict)

    return {
      "children": {
        child_id: child.export() for child_id, child in self.children.items()
      },
      **location_exported
    }


# ---


ExperimentId = NewType('ExperimentId', str)

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

  def __getstate__(self):
    return (self.archived, self.creation_time, self.id, self.path, self.title)

  def __setstate__(self, state):
    self.archived, self.creation_time, self.id, self.path, self.title = state
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

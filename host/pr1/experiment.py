import functools
import itertools
import pickle
import time
from dataclasses import dataclass, field
from pathlib import Path
from pprint import pprint
from typing import TYPE_CHECKING, Any, NewType, Optional, Self

import comserde

from .fiber.parser import BaseProgramLocation, GlobalContext
from .history import TreeAdditionChange, TreeRemovalChange, TreeUpdateChange
from .master.analysis import MasterAnalysis
from .report import ExperimentReportEvent, ExperimentReportHeader
from .util.misc import Exportable, HierarchyNode, IndexCounter

if TYPE_CHECKING:
  from .fiber.master2 import Master


EventIndex = NewType('EventIndex', int)

@dataclass
class ReportStaticEntry:
  occurence_count: int = 0
  occurences: list[tuple[EventIndex, Optional[EventIndex]]] = field(default_factory=list)
  children: dict[int, Self] = field(default_factory=dict)

  def export(self):
    return {
      "occurenceCount": self.occurence_count,
      "occurences": self.occurences,
      "children": {
        child_id: child.export() for child_id, child in self.children.items()
      }
    }


class ExperimentReportReader:
  def __init__(self, path: Path, /):
    self._path = path

    with self._get_file() as file:
      self.header: ExperimentReportHeader = comserde.load(file, ExperimentReportHeader)
      self._header_size = file.tell()

    self.master_analysis = MasterAnalysis()

    for event_index, event, root_entry in self._iter_events():
      self.end_time = event.time

      if event.analysis:
        self.master_analysis += event.analysis

      # if root_entry:
      #   print(root_entry.format_hierarchy())
      #   print()

  def _iter_events(self):
    with self._get_file() as file:
      file.seek(self._header_size)

      entries = dict[int, ReportEntry]()
      entry_counter = IndexCounter(start=1)

      self.root_static_entry = ReportStaticEntry()

      entries[0] = ReportEntry(
        index=0,
        location=None,
        static_counterpart=self.root_static_entry
      )

      for raw_event_index in itertools.count():
        event_index = EventIndex(raw_event_index)

        try:
          event: ExperimentReportEvent = comserde.load(file, ExperimentReportEvent)
        except comserde.DeserializationError:
          break

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

              if (entry.static_counterpart.occurence_count < 20) or event.analysis:
                entry.static_counterpart.occurences.append((event_index, None))

              entry.static_counterpart.occurence_count += 1

              entries[entry_index] = entry
              parent_entry.children[change.block_child_id] = entry
              entry.parent = (parent_entry, change.block_child_id)
            case TreeUpdateChange():
              entries[change.index].location = change.location
            case TreeRemovalChange():
              entry = entries[change.index]
              entry.static_counterpart.occurences[-1] = (entry.static_counterpart.occurences[-1][0], event_index)

              del entries[change.index]

              if entry.parent:
                del entry.parent[0].children[entry.parent[1]]

              entry_counter.delete(change.index)

        yield event_index, event, entries.get(1)

  def _get_file(self):
    return self._path.open("rb")

  def export_events(self, context: GlobalContext, event_indices: set[EventIndex], /):
    result = dict[EventIndex, Any]()

    for event_index, event, root_entry in self._iter_events():
      if event_index in event_indices:
        result[event_index] = {
          "date": (event.time * 1000),
          "location": root_entry and root_entry.export(context)
        }

    return result

  def export(self, context: GlobalContext):
    return {
      **self.header.export(context),
      "endDate": (self.end_time * 1000),
      "masterAnalysis": self.master_analysis.export(),
      "rootStaticEntry": self.root_static_entry.children[0].export()
    }


@dataclass(kw_only=True)
class ReportEntry(Exportable, HierarchyNode):
  children: dict[int, Self] = field(default_factory=dict)
  index: int
  location: Optional[BaseProgramLocation] = None
  parent: Optional[tuple[Self, int]] = None
  static_counterpart: ReportStaticEntry

  def __get_node_name__(self):
    return f"[{self.index}] " + (f"\x1b[37m{self.location!r}\x1b[0m" if self.location else "<no change>")

  def __get_node_children__(self):
    return self.children.values()

  def export(self, context: GlobalContext):
    assert self.location

    return {
      "children": {
        child_id: child.export(context) for child_id, child in self.children.items()
      },
      **self.location.export(context)
    }


# ---


ExperimentId = NewType('ExperimentId', str)

@dataclass(kw_only=True)
class Experiment:
  archived: bool = field(default=False, init=False)
  creation_time: float = field(default_factory=time.time, init=False)
  id: ExperimentId
  has_report: bool = comserde.field(default=False, init=False, serialize=False)
  master: 'Optional[Master]' = comserde.field(default=None, init=False, serialize=False)
  path: Path
  title: str

  _report_reader: Optional[ExperimentReportReader] = comserde.field(default=None, init=False, repr=False, serialize=False)

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

  @property
  def report_reader(self):
    if not self._report_reader:
      self._report_reader = ExperimentReportReader(self.report_path)

    return self._report_reader

  def prepare(self):
    self._report_reader = None

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

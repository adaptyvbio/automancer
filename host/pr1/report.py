from dataclasses import dataclass
from typing import Annotated, Optional
import comserde

from .history import TreeChange
from .master.analysis import MasterAnalysis
from .analysis import DiagnosticAnalysis
from .draft import Draft
from .fiber.parser import BaseBlock


@comserde.serializable
@dataclass
class ExperimentReportHeader:
  analysis: DiagnosticAnalysis
  draft: Draft
  name: str
  root: Annotated[BaseBlock, comserde.SerializationFormat('object')]
  start_time: float

  def export(self):
    return {
      "draft": self.draft.export(),
      "initialAnalysis": self.analysis.export(),
      "name": self.name,
      "root": self.root.export(),
      "startDate": (self.start_time * 1000)
    }


@comserde.serializable
@dataclass
class ExperimentReportEvent:
  analysis: Optional[MasterAnalysis]
  changes: list[TreeChange]
  time: float

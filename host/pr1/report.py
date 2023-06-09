from dataclasses import dataclass
from typing import Annotated
import comserde

from .draft import Draft
from .fiber.parser import BaseBlock


@comserde.serializable
@dataclass
class ExperimentReportHeader:
  draft: Draft
  name: str
  root: Annotated[BaseBlock, comserde.SerializationFormat('object')]

  def export(self):
    return {
      "draft": self.draft.export(),
      "name": self.name,
      "root": self.root.export()
    }

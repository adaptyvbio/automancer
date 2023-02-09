from dataclasses import KW_ONLY, dataclass, field
from typing import Any, Optional
import uuid

from .draft import DraftDiagnostic

from .reader import LocatedString, LocatedValue, LocationArea
from .util.misc import Exportable


@dataclass(kw_only=True)
class ErrorReference(Exportable):
  id: str
  label: Optional[str] = None

  def export(self):
    return {
      "id": self.id,
      "label": self.label
    }

@dataclass(kw_only=True)
class ErrorDocumentReference(ErrorReference, Exportable):
  area: Optional[LocationArea]
  document_id: str

  def export(self):
    return {
      **super().export(),
      "type": "document",
      "documentId": self.document_id,
      "ranges": [(range.start, range.end) for range in self.area.ranges] if self.area else list()
    }

  @classmethod
  def from_area(cls, area: LocationArea, *, id: str = 'target'):
    from .document import Document

    assert area.source

    document = area.source.origin
    assert isinstance(document, Document)

    return cls(
      area=area,
      document_id=document.id,
      id=id
    )

  @classmethod
  def from_value(cls, value: LocatedValue, *, id: str = 'target'):
    return cls.from_area(value.area, id=id)

@dataclass(kw_only=True)
class ErrorFileReference(ErrorReference):
  path: str

  def export(self):
    return {
      **super().export(),
      "type": "file",
      "path": self.path
    }

Trace = list[ErrorReference]

@dataclass
class Error(Exportable):
  message: str
  _: KW_ONLY
  description: list[str] = field(default_factory=list)
  id: Optional[str] = None
  references: list[ErrorReference] = field(default_factory=list)
  trace: Trace = field(default_factory=list)

  def as_master(self, *, time: Optional[float] = None):
    from .master.analysis import MasterError

    return MasterError(
      description=self.description,
      message=self.message,
      id=(self.id or str(uuid.uuid4())),
      references=self.references,
      time=time
    )

  def export(self):
    return {
      "description": self.description,
      "id": self.id,
      "message": self.message,
      "references": [ref.export() for ref in self.references],
      "trace": [ref.export() for ref in self.references]
    }

  # For compatibility only
  def diagnostic(self):
    return DraftDiagnostic(self.message, ranges=[
      range for ref in self.references if isinstance(ref, ErrorDocumentReference) and ref.area for range in ref.area.ranges
    ])


class SomeRandomError(Error):
  def __init__(self, target: LocatedString, /):
    super().__init__(
      message="Some random error",
      references=[ErrorDocumentReference.from_value(target)]
    )

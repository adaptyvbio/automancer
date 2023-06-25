import comserde
from dataclasses import KW_ONLY, dataclass, field
from typing import TYPE_CHECKING, Any, Optional
import uuid

from .util.misc import Exportable

if TYPE_CHECKING:
  from .reader import LocatedValue, LocationArea


@comserde.serializable
@dataclass(kw_only=True)
class DiagnosticReference(Exportable):
  id: str
  label: Optional[str] = None

  def export(self):
    return {
      "id": self.id,
      "label": self.label
    }

@comserde.serializable
@dataclass(kw_only=True)
class DiagnosticDocumentReference(DiagnosticReference, Exportable):
  area: 'Optional[LocationArea]'
  document_id: str

  def export(self):
    return {
      **super().export(),
      "type": "document",
      "documentId": self.document_id,
      "ranges": [(range.start, range.end) for range in self.area.ranges] if self.area else list()
    }

  @classmethod
  def from_area(cls, area: 'LocationArea', *, id: str = 'target'):
    from .document import DocumentId

    assert area.source

    document_id = area.source.origin

    if TYPE_CHECKING:
      assert isinstance(document_id, DocumentId)

    return cls(
      area=area,
      document_id=document_id,
      id=id
    )

  @classmethod
  def from_value(cls, value: 'LocatedValue', *, id: str = 'target'):
    return cls.from_area(value.area, id=id)

@dataclass(kw_only=True)
class ErrorFileReference(DiagnosticReference):
  path: str

  def export(self):
    return {
      **super().export(),
      "type": "file",
      "path": self.path
    }

Trace = list[DiagnosticReference]

@dataclass
class Diagnostic(Exportable):
  message: str
  _: KW_ONLY
  description: list[str] = field(default_factory=list)
  id: Optional[int] = None
  name: str = 'unknown'
  references: list[DiagnosticReference] = field(default_factory=list)
  trace: Optional[Trace] = None

  def export(self):
    return {
      "type": "default",
      "description": self.description,
      "id": self.id,
      "message": self.message,
      "name": self.name,
      "references": [ref.export() for ref in self.references],
      "trace": [ref.export() for ref in self.trace] if (self.trace is not None) else None
    }


__all__ = [
  'Diagnostic',
  'DiagnosticDocumentReference',
  'DiagnosticReference',
  'ErrorFileReference',
  'Trace'
]

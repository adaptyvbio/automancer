from dataclasses import KW_ONLY, dataclass, field
from typing import Optional

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
  def from_value(cls, value: LocatedValue, *, id: str = 'target'):
    from .document import Document

    assert value.source

    document = value.source.origin
    assert isinstance(document, Document)

    return cls(
      area=value.area,
      document_id=document.id,
      id=id
    )

@dataclass(kw_only=True)
class ErrorFileReference(ErrorReference):
  path: str

  def export(self):
    return {
      **super().export(),
      "type": "file",
      "path": self.path
    }

@dataclass
class Error(Exportable):
  message: str
  _: KW_ONLY
  description: list[str] = field(default_factory=list)
  id: Optional[int] = None
  references: list[ErrorReference] = field(default_factory=list)

  def export(self):
    return {
      "description": self.description,
      "id": self.id,
      "message": self.message,
      "references": [ref.export() for ref in self.references]
    }

@dataclass(kw_only=True)
class MasterError(Error, Exportable):
  time: Optional[int] = None

  def export(self):
    return {
      **super().export(),
      "date": self.time
    }


class SomeRandomError(Error):
  def __init__(self, target: LocatedString, /):
    super().__init__(
      message="Some random error",
      references=[ErrorDocumentReference.from_value(target)]
    )

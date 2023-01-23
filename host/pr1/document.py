from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Optional
from .error import ErrorDocumentReference
from .reader import LocationArea, Source


@dataclass(kw_only=True)
class DocumentOwner:
  id: str
  location: str

  def export(self):
    return {
      "id": self.id,
      "location": self.location
    }


class Document:
  def __init__(self, *, contents: str, id: str, path: PurePosixPath, owner: Optional[DocumentOwner]):
    self.id = id
    self.owner = owner
    self.path = path
    self.source = Source(contents)
    self.source.origin = self

  def export(self):
    return {
      "id": self.id,
      "owner": self.owner and self.owner.export(),
      "path": str(self.path),
      "source": self.source
    }

  @classmethod
  def load(cls, data: Any, /):
    return cls(
      contents=data["contents"],
      id=data["id"],
      path=PurePosixPath(data["path"]),
      owner=(DocumentOwner(
        id=data_owner["id"],
        location=data_owner["location"]
      ) if (data_owner := data["owner"]) else None)
    )

  @classmethod
  def text(cls, contents: str, id: str = 'default', path: PurePosixPath = PurePosixPath('/default')):
    return cls(
      contents=contents,
      id=id,
      owner=None,
      path=path
    )

from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Optional
from .error import ErrorDocumentReference
from .reader import LocationArea, Source


@dataclass(kw_only=True)
class DocumentOwner:
  id: str
  location: str


class Document:
  def __init__(self, *, contents: str, id: str, path: PurePosixPath, owner: Optional[DocumentOwner]):
    self.id = id
    self.owner = owner
    self.path = path
    self.source = Source(contents)

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

  # def reference(self, area: Optional[LocationArea] = None, *, id: str = 'main'):
  #   return ErrorDocumentReference(
  #     area=area,
  #     id=id,
  #     document_id=self.id
  #   )

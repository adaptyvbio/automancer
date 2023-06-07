import functools
from comserde import serializable
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any, Optional

from .reader import Source


@serializable
@dataclass(kw_only=True)
class DocumentOwner:
  id: str
  location: str

  def export(self):
    return {
      "id": self.id,
      "location": self.location
    }


@serializable
@dataclass(frozen=True, kw_only=True)
class Document:
  contents: str
  id: str
  path: PurePosixPath
  owner: Optional[DocumentOwner] = None

  @functools.cached_property
  def source(self):
    source = Source(self.contents)
    source.origin = self

    return source

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

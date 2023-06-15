import functools
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any, NewType

import comserde

from .reader import Source

DocumentId = NewType('DocumentId', str)

@comserde.serializable
@dataclass(frozen=True, kw_only=True)
class Document:
  contents: str
  id: DocumentId
  path: PurePosixPath

  @functools.cached_property
  def source(self):
    source = Source(self.contents)
    source.origin = self.id

    return source

  def export(self):
    return {
      "id": self.id,
      "path": str(self.path),
      "source": self.source
    }

  @classmethod
  def load(cls, data: Any, /):
    return cls(
      contents=data["contents"],
      id=data["id"],
      path=PurePosixPath("/".join(data["path"]))
    )

  @classmethod
  def text(cls, contents: str, id: str = 'default', path: PurePosixPath = PurePosixPath('/default')):
    return cls(
      contents=contents,
      id=DocumentId(id),
      path=path
    )

from abc import ABC, abstractmethod
from dataclasses import KW_ONLY, dataclass, field
from pathlib import Path
from typing import Any, Literal, Optional

from ..error import Error, ErrorReference
from ..util.misc import Exportable


@dataclass
class Effect(ABC, Exportable):
  references: list[ErrorReference] = field(default_factory=list, kw_only=True)

  @abstractmethod
  def export(self) -> Any:
    return {
      "references": [ref.export() for ref in self.references]
    }

@dataclass
class FileCreatedEffect(Effect):
  path: Path

@dataclass
class GenericEffect(Effect):
  message: str

  def export(self):
    return {
      **super().export(),
      "message": self.message
    }


@dataclass(kw_only=True)
class MasterError(Error):
  id: str
  path: list[Any] = field(default_factory=list)
  time: Optional[float] = None

  def as_master(self, time: float, /):
    return self

  def export(self):
    return {
      **super().export(),
      "date": self.time,
      "path": self.path
    }

class MasterErrorReference(ErrorReference):
  target_id: str
  _: KW_ONLY
  relation: Literal['default', 'close'] = 'default'


@dataclass(kw_only=True)
class MasterAnalysis:
  effects: list[Effect] = field(default_factory=list)
  errors: list[MasterError] = field(default_factory=list)
  warnings: list[MasterError] = field(default_factory=list)

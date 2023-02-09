import uuid
from abc import ABC, abstractmethod
from dataclasses import KW_ONLY, dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal, Optional

from ..error import Error, ErrorReference
from ..util.misc import Exportable

if TYPE_CHECKING:
  from ..fiber.langservice import Analysis


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
  id: str = field(default_factory=lambda: str(uuid.uuid4()))
  path: list[int] = field(default_factory=list)
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
class MasterAnalysis(Exportable):
  effects: list[Effect] = field(default_factory=list)
  errors: list[MasterError] = field(default_factory=list)
  warnings: list[MasterError] = field(default_factory=list)

  def __add__(self, other: 'MasterAnalysis'):
    return MasterAnalysis(
      effects=(self.effects + other.effects),
      errors=(self.errors + other.errors),
      warnings=(self.warnings + other.warnings)
    )

  def clear(self):
    self.effects.clear()
    self.errors.clear()
    self.warnings.clear()

  def export(self):
    return {
      "effects": [effect.export() for effect in self.effects],
      "errors": [error.export() for error in self.errors],
      "warnings": [warning.export() for warning in self.warnings]
    }

  @classmethod
  def cast(cls, analysis: 'Analysis'):
    return MasterAnalysis(
      errors=[error.as_master() for error in analysis.errors],
      warnings=[warning.as_master() for warning in analysis.warnings]
    )

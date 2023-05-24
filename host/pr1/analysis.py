from abc import ABC
from dataclasses import dataclass, field
from logging import Logger
from typing import Self, Sequence, TypeVar

from .error import Diagnostic, DiagnosticDocumentReference


T = TypeVar('T')
S = TypeVar('S')

@dataclass(kw_only=True)
class BaseAnalysis(ABC):
  def add(self, other: tuple[Self, T], /) -> T:
    other_analysis, other_value = other
    self += other_analysis

    return other_value

  def add_mapping(self, other: dict[T, tuple[Self, S]], /) -> dict[T, S]:
    return { key: self.add(value) for key, value in other.items() }

  def add_sequence(self, other: list[tuple[Self, T]], /) -> list[T]:
    return self.add(self.__class__.sequence(other))

  def __add__(self, other: Self, /) -> Self:
    return self.__class__().__iadd__(self).__iadd__(other)

  def __iadd__(self, other: Self, /):
    return self

  @classmethod
  def sequence(cls, obj: Sequence[tuple[Self, T]], /) -> tuple[Self, list[T]]:
    analysis = cls()
    output = list[T]()

    for item in obj:
      output.append(analysis.add(item))

    return analysis, output


@dataclass(kw_only=True)
class DiagnosticAnalysis(BaseAnalysis):
  errors: list[Diagnostic] = field(default_factory=list)
  warnings: list[Diagnostic] = field(default_factory=list)

  def log_diagnostics(self, logger: Logger):
    for error in self.errors:
      logger.error(error.message)

      for ref in error.references:
        if isinstance(ref, DiagnosticDocumentReference) and ref.area:
          for line in ref.area.format().splitlines():
            logger.debug(line)

    for warning in self.warnings:
      logger.warning(warning.message)

      for ref in warning.references:
        if isinstance(ref, DiagnosticDocumentReference) and ref.area:
          for line in ref.area.format().splitlines():
            logger.debug(line)


  def __iadd__(self, other: 'DiagnosticAnalysis', /):
    self.errors += other.errors
    self.warnings += other.warnings

    return super().__iadd__(other)


__all__ = [
  'BaseAnalysis',
  'DiagnosticAnalysis'
]

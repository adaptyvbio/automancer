from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from logging import Logger
from typing import Self, Sequence, TypeVar

from .error import Diagnostic, DiagnosticDocumentReference


T = TypeVar('T')
S = TypeVar('S')

@dataclass(kw_only=True)
class BaseAnalysis():
  def add(self, other: 'tuple[BaseAnalysis, T]', /) -> T:
    other_analysis, other_value = other
    old_self = self

    self += other_analysis

    if self is not old_self:
      raise RuntimeError("Invalid operation")

    return other_value

  def add_mapping(self, other: dict[T, tuple[Self, S]], /) -> dict[T, S]:
    return { key: self.add(value) for key, value in other.items() }

  def add_sequence(self, other: list[tuple[Self, T]], /) -> list[T]:
    return self.add(self.__class__.sequence(other))

  def __add__(self, other: 'BaseAnalysis', /) -> Self:
    return self.__class__().__iadd__(self).__iadd__(other)

  def __iadd__(self, other: 'BaseAnalysis', /):
    if (other.__class__ is not self.__class__) and issubclass(other.__class__, self.__class__):
      # TODO: Check if useful
      return other + self

    self._add(other)
    return self

  @abstractmethod
  def _add(self, other: 'BaseAnalysis', /):
    pass

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


  def _add(self, other: 'DiagnosticAnalysis', /):
    super()._add(other)
    self.errors += other.errors
    self.warnings += other.warnings


__all__ = [
  'BaseAnalysis',
  'DiagnosticAnalysis'
]

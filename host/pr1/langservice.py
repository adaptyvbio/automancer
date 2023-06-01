# Language service

from dataclasses import KW_ONLY, dataclass, field
from typing import Literal, Optional, Self

from .analysis import DiagnosticAnalysis

from .reader import LocationRange
from .error import DiagnosticDocumentReference
from .util.misc import Exportable


@dataclass
class LanguageServiceMarker(Exportable):
  message: str
  reference: DiagnosticDocumentReference
  _: KW_ONLY
  kind: Literal['deprecated', 'unnecessary']

  def export(self):
    return {
      "kind": self.kind,
      "message": self.message,
      "reference": self.reference.export()
    }

@dataclass
class LanguageServiceRelation(Exportable):
  definition_body: DiagnosticDocumentReference
  definition_name: DiagnosticDocumentReference
  references: list[DiagnosticDocumentReference]

  def export(self):
    return {
      "definitionBody": self.definition_body.export(),
      "definitionName": self.definition_name.export(),
      "references": [ref.export() for ref in self.references]
    }

@dataclass
class LanguageServiceRename(Exportable):
  items: list[DiagnosticDocumentReference]

  def export(self):
    return {
      "items": [ref.export() for ref in self.items]
    }

@dataclass
class LanguageServiceSelection(Exportable):
  range: LocationRange

  def export(self):
    return [self.range.start, self.range.end]

@dataclass
class LanguageServiceToken(Exportable):
  name: str
  reference: DiagnosticDocumentReference

  def export(self):
    return {
      "name": self.name,
      "reference": self.reference.export()
    }

@dataclass(kw_only=True)
class LanguageServiceCompletionItem:
  documentation: Optional[str]
  kind: str
  label: str
  namespace: Optional[str]
  signature: Optional[str]
  sublabel: Optional[str]
  text: str

@dataclass(kw_only=True)
class LanguageServiceCompletion:
  items: list[LanguageServiceCompletionItem]
  ranges: list[LocationRange]

  def export(self):
    return {
      "items": [{
        "documentation": item.documentation,
        "kind": item.kind,
        "label": item.label,
        "namespace": item.namespace,
        "signature": item.signature,
        "sublabel": item.sublabel,
        "text": item.text
      } for item in self.items],
      "ranges": [[range.start, range.end] for range in self.ranges]
    }

@dataclass
class LanguageServiceFoldingRange:
  range: LocationRange
  _: KW_ONLY
  kind: Literal['region'] = 'region'

  def export(self):
    return {
      "kind": self.kind,
      "range": [self.range.start, self.range.end]
    }

@dataclass(kw_only=True)
class LanguageServiceHover:
  contents: list[str]
  range: LocationRange

  def export(self):
    return {
      "contents": self.contents,
      "range": [self.range.start, self.range.end]
    }


@dataclass(kw_only=True)
class LanguageServiceAnalysis(DiagnosticAnalysis):
  completions: list[LanguageServiceCompletion] = field(default_factory=list)
  folds: list[LanguageServiceFoldingRange] = field(default_factory=list)
  hovers: list[LanguageServiceHover] = field(default_factory=list)
  markers: list[LanguageServiceMarker] = field(default_factory=list)
  relations: list[LanguageServiceRelation] = field(default_factory=list)
  renames: list[LanguageServiceRename] = field(default_factory=list)
  selections: list[LanguageServiceSelection] = field(default_factory=list)
  tokens: list[LanguageServiceToken] = field(default_factory=list)

  def _add(self, other, /):
    super()._add(other)

    if isinstance(other, LanguageServiceAnalysis):
      self.completions += other.completions
      self.folds += other.folds
      self.hovers += other.hovers
      self.markers += other.markers
      self.relations += other.relations
      self.renames += other.renames
      self.selections += other.selections
      self.tokens += other.tokens

  def __repr__(self):
    return f"{self.__class__.__name__}(errors={self.errors!r})"


__all__ = [
  'LanguageServiceAnalysis',
  'LanguageServiceCompletion',
  'LanguageServiceCompletionItem',
  'LanguageServiceFoldingRange',
  'LanguageServiceHover',
  'LanguageServiceMarker',
  'LanguageServiceRelation',
  'LanguageServiceRename',
  'LanguageServiceSelection',
  'LanguageServiceToken'
]

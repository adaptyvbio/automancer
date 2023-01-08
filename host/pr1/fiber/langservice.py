import builtins
from logging import Logger
from tokenize import TokenError
from types import EllipsisType
import pint
from collections import namedtuple
from pint import Quantity, Unit
from typing import Any, Literal, Optional, Protocol, cast

from ..ureg import ureg
from ..util.parser import check_identifier
from ..draft import DraftDiagnostic, DraftGenericError
from ..reader import LocatedError, LocatedString, LocatedValue, LocationArea, LocationRange, ReliableLocatedDict, ReliableLocatedList


class Selection:
  def __init__(self, range: LocationRange):
    self.range = range

  def export(self):
    return [self.range.start, self.range.end]


class Analysis:
  def __init__(self, *, errors = None, warnings = None, completions = None, folds = None, hovers = None, selections: Optional[list[Selection]] = None):
    self.errors = errors or list()
    self.warnings = warnings or list()

    self.completions = completions or list()
    self.folds = folds or list()
    self.hovers = hovers or list()
    self.selections = selections or list()

  def __add__(self, other: 'Analysis'):
    return Analysis(
      errors=(self.errors + other.errors),
      warnings=(self.warnings + other.warnings),
      completions=(self.completions + other.completions),
      folds=(self.folds + other.folds),
      hovers=(self.hovers + other.hovers),
      selections=(self.selections + other.selections)
    )

  def __repr__(self):
    return f"Analysis(errors={repr(self.errors)}, warnings={repr(self.warnings)}, completions={repr(self.completions)}, folds={repr(self.folds)}, hovers={repr(self.hovers)}, selection={repr(self.selections)})"


CompletionItem = namedtuple("CompletionItem", ['documentation', 'kind', 'label', 'namespace', 'signature', 'sublabel', 'text'])

class Completion:
  def __init__(self, *, items: list[CompletionItem], ranges: list[LocationRange]):
    self.items = items
    self.ranges = ranges

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

  def __repr__(self):
    return f"Completion(items={repr(self.items)}, ranges={repr(self.ranges)})"


class FoldingRange:
  def __init__(self, range, *, kind = 'region'):
    self.kind = kind
    self.range = range

  def export(self):
    return {
      "kind": self.kind,
      "range": [self.range.start, self.range.end]
    }

class Hover:
  def __init__(self, contents, range):
    self.contents = contents
    self.range = range

  def export(self):
    return {
      "contents": self.contents,
      "range": [self.range.start, self.range.end]
    }


class LangServiceError(Exception):
  pass

class AmbiguousKeyError(LangServiceError):
  def __init__(self, key, target):
    self.key = key
    self.target = target

  def diagnostic(self):
    return DraftDiagnostic(f"Ambiguous key '{self.key}'", ranges=self.key.area.ranges)

class DuplicateKeyError(LangServiceError):
  def __init__(self, key, target):
    self.key = key
    self.target = target

  def diagnostic(self):
    return DraftDiagnostic(f"Duplicate key '{self.key}'", ranges=self.key.area.ranges)

class ExtraneousKeyError(LangServiceError):
  def __init__(self, key, target):
    self.key = key
    self.target = target

  def diagnostic(self):
    return DraftDiagnostic(f"Extraneous key '{self.key}'", ranges=self.key.area.ranges)

class MissingKeyError(LangServiceError):
  def __init__(self, key, target):
    self.key = key
    self.target = target

  def diagnostic(self):
    return DraftDiagnostic(f"Missing key '{self.key}'", ranges=self.target.area.ranges)

class InvalidIdentifierError(LangServiceError):
  def __init__(self, target: LocatedValue, /):
    self.target = target

class InvalidEnumValueError(LangServiceError):
  def __init__(self, target: LocatedValue, /):
    self.target = target


class Type(Protocol):
  def analyze(self, obj: Any, context: Any) -> tuple[Analysis, Any | EllipsisType]:
    ...

CompletionKind = Literal['class', 'constant', 'enum', 'field', 'property']

class Attribute:
  def __init__(
    self,
    type: Type,
    *,
    deprecated: bool = False,
    description: Optional[str] = None,
    documentation: Optional[list[str]] = None,
    kind: CompletionKind = 'field',
    label: Optional[str] = None,
    optional: bool = False,
    signature: Optional[str] = None
  ):
    self._deprecated = deprecated
    self._description = description
    self._documentation = documentation
    self._kind = kind
    self._label = label
    self._optional = optional
    self._signature = signature
    self._type = type

  def analyze(self, obj, key, context):
    analysis = Analysis()
    key_range = key.area.single_range()

    if self._description or self._documentation or self._label:
      analysis.hovers.append(Hover(
        contents=([f"#### {self._label or key.upper()}"] + ([self._description] if self._description else list()) + (self._documentation or list())),
        range=key_range
      ))

    if self._deprecated:
      # TODO: Use a deprecation flag
      analysis.warnings.append(DraftGenericError("This attribute is deprecated", ranges=[key_range]))

    value_analysis, value = self._type.analyze(obj, context)

    return (analysis + value_analysis), value


class CompositeDict:
  _native_namespace = "_"
  _separator = "/"

  def __init__(self, attrs: dict[str, Attribute | Type] = dict(), /, *, foldable: bool = True, strict: bool = False):
    self._foldable = foldable
    self._strict = strict

    self._attributes = {
      attr_name: { self._native_namespace: attr if isinstance(attr, Attribute) else Attribute(cast(Type, attr)) } for attr_name, attr in attrs.items()
    }

    self._namespaces = {self._native_namespace}

  @property
  def completion_items(self):
    completion_items = list[CompletionItem]()

    for attr_name, attr_entries in self._attributes.items():
      ambiguous = (len(attr_entries) > 1)

      for namespace, attr in attr_entries.items():
        native = (namespace == self._native_namespace)

        completion_items.append(CompletionItem(
          documentation=attr._description,
          kind=attr._kind,
          label=attr_name,
          namespace=(namespace if not native else None),
          signature=(attr._signature or (f"{attr_name}: <value>" if attr._description else None)),
          sublabel=attr._label,
          text=(f"{namespace}{self._separator}{attr_name}" if ambiguous and (not native) else attr_name)
        ))

    return completion_items

  def add(self, attrs, *, namespace):
    self._namespaces.add(namespace)

    for attr_name, attr in attrs.items():
      if not attr_name in self._attributes:
        self._attributes[attr_name] = dict()

      self._attributes[attr_name][namespace] = attr

  def get_attr(self, attr_name):
    segments = attr_name.split(self._separator)

    if len(segments) > 1:
      namespace = segments[0]
      attr_name = self._separator.join(segments[1:])
    else:
      namespace = None

    attr_entries = self._attributes.get(attr_name)

    return namespace, attr_name, attr_entries

  def analyze(self, obj, context):
    analysis = Analysis()
    strict_failed = False

    primitive_analysis, obj = PrimitiveType(dict).analyze(obj, context)
    analysis += primitive_analysis

    if obj is Ellipsis:
      return analysis, obj

    assert isinstance(obj, ReliableLocatedDict)

    if self._foldable:
      analysis.folds.append(FoldingRange(obj.fold_range))

    analysis.selections.append(Selection(obj.full_area.enclosing_range()))

    attr_values = { namespace: dict() for namespace in self._namespaces }

    for obj_key, obj_value in obj.items():
      namespace, attr_name, attr_entries = self.get_attr(obj_key)

      # e.g. 'invalid/bar'
      if namespace and not (namespace in self._namespaces):
        analysis.errors.append(ExtraneousKeyError(namespace, obj))
        continue

      # e.g. 'foo/invalid' or 'invalid'
      if not attr_entries:
        analysis.errors.append(ExtraneousKeyError(obj_key, obj))
        continue

      if not namespace:
        # e.g. 'bar' where '_/bar' exists
        if self._native_namespace in attr_entries:
          namespace = self._native_namespace
        # e.g. 'bar' where only 'a/bar' exists
        elif len(attr_entries) == 1:
          namespace = next(iter(attr_entries.keys()))
        # e.g. 'bar' where 'a/bar' and 'b/bar' both exist, but not '_/bar'
        else:
          analysis.errors.append(AmbiguousKeyError(obj_key, obj))
          continue
      # e.g. 'foo/bar'
      else:
        pass

      if attr_name in attr_values[namespace]:
        analysis.errors.append(DuplicateKeyError(obj_key, obj))
        continue

      attr = attr_entries[namespace]
      attr_analysis, attr_value = attr.analyze(obj_value, obj_key, context)

      if not (isinstance(attr_value, EllipsisType) and self._strict and attr._optional):
        attr_values[namespace][attr_name] = attr_value

        if isinstance(attr_value, EllipsisType):
          strict_failed = True

      analysis += attr_analysis

    for attr_name, attr_entries in self._attributes.items():
      for namespace, attr in attr_entries.items():
        if (not attr._optional) and not (attr_name in attr_values[namespace]):
          analysis.errors.append(MissingKeyError((f"{namespace}{self._separator}" if namespace != self._native_namespace else str()) + attr_name, obj))
          strict_failed = True

    analysis.completions.append(Completion(
      items=self.completion_items,
      ranges=[
        *[obj_key.area.single_range() for obj_key in obj.keys()],
        *obj.completion_ranges
      ]
    ))

    return analysis, attr_values if not (self._strict and strict_failed) else Ellipsis

  def merge(self, attr_values1, attr_values2):
    return {
      namespace: attr_values1[namespace] | attr_values2[namespace] for namespace in attr_values1.keys()
    }


class SimpleDict(CompositeDict):
  def __init__(self, attrs: dict[str, Attribute | Type], /, *, foldable = False, strict = False):
    super().__init__(attrs, foldable=foldable, strict=strict)

  def analyze(self, obj, context):
    analysis, output = super().analyze(obj, context)

    return analysis, output[self._native_namespace] if not isinstance(output, EllipsisType) else Ellipsis

class DictType(SimpleDict):
  def __init__(self, attrs, *, foldable = False):
    super().__init__(attrs, foldable=foldable, strict=True)

  # def analyze(self, obj, context):
  #   analysis, value = super().analyze(obj, context)

  #   if isinstance(value, EllipsisType):
  #     return analysis, Ellipsis

  #   return LocatedDict(, area=obj.area)


class InvalidValueError(LangServiceError):
  def __init__(self, target):
    self.target = target

  def diagnostic(self):
    return DraftDiagnostic(f"Invalid value", ranges=self.target.area.ranges)

class InvalidPrimitiveError(LangServiceError):
  def __init__(self, target, primitive):
    self.primitive = primitive
    self.target = target

  def diagnostic(self):
    return DraftDiagnostic(f"Invalid type", ranges=self.target.area.ranges)

class MissingUnitError(LangServiceError):
  def __init__(self, target, unit):
    self.target = target
    self.unit = unit

  def diagnostic(self):
    return DraftDiagnostic(f"Missing unit, expected {self.unit:~P}", ranges=self.target.area.ranges)

class InvalidUnitError(LangServiceError):
  def __init__(self, target, unit):
    self.unit = unit
    self.target = target

  def diagnostic(self):
    return DraftDiagnostic(f"Invalid unit, expected {self.unit:~P}", ranges=self.target.area.ranges)

class UnknownUnitError(LangServiceError):
  def __init__(self, target):
    self.target = target

  def diagnostic(self):
    return DraftDiagnostic(f"Unknown unit", ranges=self.target.area.ranges)

class InvalidExprKind(LangServiceError):
  def __init__(self, target):
    self.target = target

  def diagnostic(self):
    return DraftDiagnostic(f"Invalid expression kind", ranges=self.target.area.ranges)


class AnyType:
  def __init__(self):
    pass

  def analyze(self, obj, context):
    return Analysis(), obj

class PrimitiveType:
  def __init__(self, primitive: Any, /):
    self._primitive = primitive

  def analyze(self, obj, context):
    match self._primitive:
      case builtins.float | builtins.int if isinstance(obj, str):
        try:
          value = self._primitive(obj.value)
        except (TypeError, ValueError):
          return Analysis(errors=[InvalidPrimitiveError(obj, self._primitive)]), Ellipsis
        else:
          return Analysis(), LocatedValue.new(value, area=obj.area)
      case builtins.bool if isinstance(obj, str):
        if obj.value in ("true", "false"):
          return Analysis(), LocatedValue.new((obj.value == "true"), area=obj.area)
        else:
          return Analysis(errors=[InvalidPrimitiveError(obj, self._primitive)]), Ellipsis
      case _ if not isinstance(obj.value, self._primitive):
        return Analysis(errors=[InvalidPrimitiveError(obj, self._primitive)]), Ellipsis
      case _:
        return Analysis(), obj

class ListType(PrimitiveType):
  def __init__(self, item_type: Type, /, *, foldable: bool = True):
    super().__init__(list)

    self._foldable = foldable
    self._item_type = item_type

  def analyze(self, obj, context):
    analysis, obj = super().analyze(obj, context)

    if isinstance(obj, EllipsisType):
      return analysis, Ellipsis

    assert isinstance(obj, ReliableLocatedList)

    if self._foldable:
      analysis.folds.append(FoldingRange(obj.fold_range))

    analysis.selections.append(Selection(obj.full_area.enclosing_range()))

    result = list()

    for item in obj:
      item_analysis, item_result = self._item_type.analyze(item, context)

      analysis += item_analysis

      if not isinstance(item_result, EllipsisType):
        result.append(item_result)

    if obj.completion_ranges and isinstance(self._item_type, DictType):
      analysis.completions.append(Completion(
        items=self._item_type.completion_items,
        ranges=list(obj.completion_ranges)
      ))

    return analysis, result

class LiteralOrExprType:
  def __init__(self, obj_type: Optional[Type] = None, /, *, dynamic: bool = False, expr_type: Optional[Type] = None, field: bool = False, static: bool = False):
    from .expr import PythonExprKind

    self._kinds = set()
    self._type = obj_type or cast(Type, super())
    self._expr_type = expr_type or self._type

    if dynamic:
      self._kinds.add(PythonExprKind.Dynamic)
    if field:
      self._kinds.add(PythonExprKind.Field)
    if static:
      self._kinds.add(PythonExprKind.Static)

  def analyze(self, obj, context):
    from .expr import PythonExpr

    if isinstance(obj, str):
      assert isinstance(obj, LocatedString)
      result = PythonExpr.parse(obj, type=self._expr_type)

      if result:
        analysis, expr = result

        if isinstance(expr, EllipsisType):
          return analysis, Ellipsis

        if not (expr.kind in self._kinds):
          analysis.errors.append(InvalidExprKind(obj))
          return analysis, Ellipsis

        return analysis, LocatedValue.new(expr, area=obj.area)

    return self._type.analyze(obj, context)

class QuantityType:
  def __init__(self, unit: Optional[Unit | str], *, allow_nil: bool = False):
    self._allow_nil = allow_nil
    self._unit: Unit = ureg.Unit(unit)

  def analyze(self, obj, context):
    if self._allow_nil and ((obj == "nil") or (obj.value == None)):
      return Analysis(), LocatedValue.new(None, area=obj.area)

    if isinstance(obj, str):
      assert isinstance(obj, LocatedString)

      try:
        value = ureg.Quantity(obj.value)
      except pint.errors.UndefinedUnitError:
        return Analysis(errors=[UnknownUnitError(obj)]), Ellipsis
      except (pint.PintError, TokenError):
        return Analysis(errors=[InvalidPrimitiveError(obj, Quantity)]), Ellipsis
    else:
      value = obj.value

    return self.check(value, self._unit, target=obj)

  @staticmethod
  def check(value: ureg.Quantity, unit: Unit, *, target: LocatedValue):
    match value:
      case Quantity() if value.check(unit):
        return Analysis(), LocatedValue.new(value.to(unit), area=target.area)
      case Quantity(dimensionless=True):
        return Analysis(errors=[MissingUnitError(target, unit)]), Ellipsis
      case Quantity():
        return Analysis(errors=[InvalidUnitError(target, unit)]), Ellipsis
      case _:
        return Analysis(errors=[InvalidPrimitiveError(target, Quantity)]), Ellipsis

class ArbitraryQuantityType:
  def analyze(self, obj, context):
    try:
      quantity = context.ureg.Quantity(obj.value)
    except pint.errors.UndefinedUnitError:
      return Analysis(errors=[UnknownUnitError(obj)]), Ellipsis
    except pint.PintError:
      return Analysis(errors=[InvalidPrimitiveError(obj, pint.Quantity)]), Ellipsis

    return Analysis(), LocatedValue.new(quantity, area=obj.area)


class StrType(PrimitiveType):
  def __init__(self):
    super().__init__(str)

class IdentifierType(StrType):
  def __init__(self, *, allow_leading_digit = False):
    super().__init__()
    self._allow_leading_digit = allow_leading_digit

  def analyze(self, obj, context):
    analysis, obj_new = super().analyze(obj, context)

    if isinstance(obj_new, EllipsisType):
      return analysis, Ellipsis

    try:
      check_identifier(obj_new, allow_leading_digit=self._allow_leading_digit)
    except LocatedError:
      analysis.errors.append(InvalidIdentifierError(obj))
      return analysis, Ellipsis

    return analysis, obj_new

class EnumType:
  def __init__(self, *variants: str):
    self._variants = variants

  def analyze(self, obj, context):
    analysis = Analysis()

    if not obj in self._variants:
      analysis.errors.append(InvalidEnumValueError(obj))
      return analysis, Ellipsis

    return analysis, obj

# class LiteralStrType(StrType):
#   def __init__(self, value: str, /):
#     self._value = value

#   def analyze(self, obj, context):
#     if obj != self._value:


def print_analysis(analysis: Analysis, /, logger: Logger):
  for error in analysis.errors:
    diagnostic = error.diagnostic()
    area = LocationArea(diagnostic.ranges)

    logger.error(diagnostic.message)

    for line in area.format().splitlines():
      logger.debug(line)

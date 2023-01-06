import builtins
from logging import Logger
from types import EllipsisType
import pint
from collections import namedtuple
from pint import Quantity, Unit
from typing import Any, Literal, Optional, Protocol, cast

from ..util.parser import check_identifier

from .expr import PythonExprEvaluator
from ..draft import DraftDiagnostic, DraftGenericError
from ..reader import LocatedError, LocatedValue, LocationArea, LocationRange


class Analysis:
  def __init__(self, *, errors = None, warnings = None, completions = None, folds = None, hovers = None):
    self.errors = errors or list()
    self.warnings = warnings or list()

    self.completions = completions or list()
    self.folds = folds or list()
    self.hovers = hovers or list()

  def __add__(self, other):
    return Analysis(
      errors=(self.errors + other.errors),
      warnings=(self.warnings + other.warnings),
      completions=(self.completions + other.completions),
      folds=(self.folds + other.folds),
      hovers=(self.hovers + other.hovers)
    )

  def __repr__(self):
    return f"Analysis(errors={repr(self.errors)}, warnings={repr(self.warnings)}, completions={repr(self.completions)}, folds={repr(self.folds)}, hovers={repr(self.hovers)})"


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

  def __init__(self, attrs: dict[str, Attribute | Type] = dict(), /, *, foldable = False, strict = False):
    self._foldable = foldable
    self._strict = strict

    self._attributes = {
      attr_name: { self._native_namespace: attr if isinstance(attr, Attribute) else Attribute(cast(Type, attr)) } for attr_name, attr in attrs.items()
    }

    self._namespaces = {self._native_namespace}

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

    # if attr_entries and namespace:
    #   return attr_entries.get(namespace)
    # elif attr_entries and (self._main_namespace in attr_entries):
    #   return attr_entries[self._main_namespace]
    # else:
    #   return attr_entries

  # def analyze_backbone(self, obj):
  #   analysis = Analysis()

  #   primitive_analysis, obj = PrimitiveType(dict).analyze(obj)
  #   analysis += primitive_analysis

  #   if obj is Ellipsis:
  #     return analysis

  #   if self._foldable:
  #     analysis.folds.append(FoldingRange(obj.area.enclosing_range()))

  #   # TODO: add completion

  #   return analysis

  def analyze(self, obj, context):
    analysis = Analysis()
    strict_failed = False

    primitive_analysis, obj = PrimitiveType(dict).analyze(obj, context)
    analysis += primitive_analysis

    if obj is Ellipsis:
      return analysis, obj

    if self._foldable:
      analysis.folds.append(FoldingRange(obj.area.enclosing_range()))

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


    completion_items = list()

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

    analysis.completions.append(Completion(
      items=completion_items,
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
  def __init__(self, item_type: Type):
    super().__init__(list)
    self._item_type = item_type

  def analyze(self, obj, context):
    analysis, obj = super().analyze(obj, context)

    if isinstance(obj, EllipsisType):
      return analysis, Ellipsis

    assert isinstance(obj, list)
    result = list()

    for item in obj:
      item_analysis, item_result = self._item_type.analyze(item, context)

      analysis += item_analysis

      if not isinstance(item_result, EllipsisType):
        result.append(item_result)

    return analysis, result

class LiteralOrExprType:
  def __init__(self, obj_type, /, *, field = True, static = False):
    from .expr import PythonExprKind

    self._kinds = set()
    self._type = obj_type

    if field:
      self._kinds.add(PythonExprKind.Field)
    if static:
      self._kinds.add(PythonExprKind.Static)

  def analyze(self, obj, context):
    from .expr import PythonExpr # TODO: improve

    if isinstance(obj, str):
      result = PythonExpr.parse(obj)

      if result:
        analysis, expr = result

        if expr is Ellipsis:
          return analysis, Ellipsis

        # if expr.kind in self._kinds:
        return analysis, PythonExprEvaluator(expr, type=self._type)

    return self._type.analyze(obj, context)

class QuantityType(LiteralOrExprType):
  def __init__(self, unit: Optional[Unit | str], *, allow_nil: bool = False):
    self._allow_nil = allow_nil
    self._unit = unit

  def analyze(self, obj, context):
    if isinstance(obj, str):
      if self._allow_nil and (obj == "nil"):
        return Analysis(), LocatedValue.new(None, area=obj.area)

      try:
        value = context.ureg.Quantity(obj.value)
      except pint.errors.UndefinedUnitError:
        return Analysis(errors=[UnknownUnitError(obj)]), Ellipsis
      except pint.PintError:
        return Analysis(errors=[InvalidPrimitiveError(obj, pint.Quantity)]), Ellipsis
    else:
      value = obj

    return self.check(value, self._unit, target=obj)

  @staticmethod
  def check(value: Quantity, unit: Unit | str, *, target):
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

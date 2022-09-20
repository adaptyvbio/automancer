import builtins
from collections import namedtuple

from ..draft import DraftDiagnostic
from .. import reader


class Analysis:
  def __init__(self, *, errors = None, warnings = None, completions = None, folds = None, hovers = None):
    self.errors = errors or list()
    self.warnings = warnings or list()

    self.completions = completions or list()
    self.folds = folds or list()
    self.hovers = hovers or list()
    # self.definitions = definitions / definition + references
    # self.links = links
    # self.lenses = lenses
    # self.symbols = symbols / rename + highlight

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


CompletionItem = namedtuple("CompletionItem", ['description', 'detail', 'kind', 'label', 'text'])

class Completion:
  def __init__(self, *, items, ranges):
    self.items = items
    self.ranges = ranges

  def export(self):
    return {
      "items": [{
        "description": item.description,
        "detail": item.detail,
        "kind": item.kind,
        "label": item.label,
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


class Attribute:
  def __init__(self, *, description = None, detail = None, label = None, optional = False, type):
    self._description = description
    self._detail = detail
    self._label = label
    self._optional = optional
    self._type = type

  def analyze(self, obj, key):
    analysis = Analysis()

    if self._description:
      analysis.hovers.append(Hover(
        contents=self._description,
        range=key.area.single_range()
      ))

    value_analysis, value = self._type.analyze(obj)

    return (analysis + value_analysis), value


class CompositeDict:
  _native_namespace = "_"

  def __init__(self, attrs = dict(), *, foldable = False):
    self._foldable = foldable

    self._attributes = {
      attr_name: { self._native_namespace: attr } for attr_name, attr in attrs.items()
    }

    self._namespaces = {self._native_namespace}

  def add(self, attrs, *, namespace):
    self._namespaces.add(namespace)

    for attr_name, attr in attrs.items():
      if not attr_name in self._attributes:
        self._attributes[attr_name] = dict()

      self._attributes[attr_name][namespace] = attr

  def get_attr(self, attr_name):
    segments = attr_name.split(".")

    if len(segments) > 1:
      namespace = segments[0]
      attr_name = ".".join(segments[1:])
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

  def analyze(self, obj, target_namespace = None):
    analysis = Analysis()

    primitive_analysis, obj = PrimitiveType(dict).analyze(obj)
    analysis += primitive_analysis

    if obj is Ellipsis:
      return analysis, obj

    # if not target_namespace:

    if self._foldable:
      analysis.folds.append(FoldingRange(obj.area.enclosing_range()))

    attr_values = { namespace: dict() for namespace in self._namespaces }

    for obj_key, obj_value in obj.items():
      namespace, attr_name, attr_entries = self.get_attr(obj_key)

      # e.g. 'invalid.bar'
      if namespace and not (namespace in self._namespaces):
        analysis.errors.append(ExtraneousKeyError(namespace, obj))
        continue

      # e.g. 'foo.invalid' or 'invalid'
      if not attr_entries:
        analysis.errors.append(ExtraneousKeyError(obj_key, obj))
        continue

      if not namespace:
        # e.g. 'bar' where '_.bar' exists
        if self._native_namespace in attr_entries:
          namespace = self._native_namespace
        # e.g. 'bar' where only 'a.bar' exists
        elif len(attr_entries) == 1:
          namespace = next(iter(attr_entries.keys()))
        # e.g. 'bar' where 'a.bar' and 'b.bar' both exist, but not '_.bar'
        else:
          analysis.errors.append(AmbiguousKeyError(obj_key, obj))
          continue
      # e.g. 'foo.bar'
      else:
        pass

      if attr_name in attr_values[namespace]:
        analysis.errors.append(DuplicateKeyError(obj_key, obj))
        continue

      attr = attr_entries[namespace]
      attr_analysis, attr_values[namespace][attr_name] = attr.analyze(obj_value, obj_key)

      analysis += attr_analysis

    for attr_name, attr_entries in self._attributes.items():
      for namespace, attr in attr_entries.items():
        if (not attr._optional) and not (attr_name in attr_values[namespace]):
          analysis.errors.append(MissingKeyError(f"{namespace}.{attr_name}", obj))


    completion_items = list()

    for attr_name, attr_entries in self._attributes.items():
      ambiguous = (len(attr_entries) > 1)

      for namespace, attr in attr_entries.items():
        native = (namespace == self._native_namespace)

        completion_items.append(CompletionItem(
          description=(namespace if not native else None),
          detail=attr._detail,
          label=attr_name,
          kind='constant',
          text=(f"{namespace}.{attr_name}" if ambiguous and (not native) else attr_name)
        ))

    analysis.completions.append(Completion(
      items=completion_items,
      ranges=[obj_key.area.single_range() for obj_key in obj.keys()]
    ))

    return analysis, attr_values


class SimpleDict(CompositeDict):
  def __init__(self, attrs, *, foldable = False):
    super().__init__(attrs, foldable=foldable)

  def analyze(self, obj):
    analysis, output = super().analyze(obj)

    return analysis, output[self._native_namespace]


class InvalidPrimitiveError(LangServiceError):
  def __init__(self, target, primitive):
    self.primitive = primitive
    self.target = target

class AnyType:
  def __init__(self):
    pass

  def analyze(self, obj):
    return Analysis(), obj

class PrimitiveType:
  def __init__(self, primitive):
    self._primitive = primitive

  def analyze(self, obj):
    analysis = Analysis()

    match self._primitive:
      case builtins.float | builtins.int:
        try:
          value = self._primitive(obj)
        except ValueError:
          analysis.errors.append(InvalidPrimitiveError(obj, self._primitive))
          value = Ellipsis

        value = reader.LocatedValueContainer(value, area=obj.area)
      case builtins.str:
        value = obj
      case _ if not isinstance(obj, self._primitive):
        analysis.errors.append(InvalidPrimitiveError(obj, self._primitive))
        value = reader.LocatedValueContainer(Ellipsis, area=obj.area)
      case _:
        value = obj

    return analysis, value

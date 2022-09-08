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


CompletionItem = namedtuple("CompletionItem", ['detail', 'documentation', 'kind', 'label', 'text'])

class Completion:
  def __init__(self, *, items, ranges):
    self.items = items
    self.ranges = ranges

  def export(self):
    return {
      "items": [{
        "detail": item.detail,
        "documentation": item.documentation,
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
  def __init__(self, *, description = None, label = None, optional = False, type):
    self._description = description
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

    return analysis


class Dict:
  _main_namespace = "_"

  def __init__(self, attrs = dict(), *, foldable = False):
    self._foldable = foldable

    self._attributes = {
      attr_name: { self._main_namespace: attr } for attr_name, attr in attrs.items()
    }

    self._namespaces = {self._main_namespace}

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

  def analyze(self, obj):
    analysis = Analysis()

    if not isinstance(obj, dict):
      analysis.errors.append(...)
      return

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
        if self._main_namespace in attr_entries:
          namespace = self._main_namespace
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
      attr_values[namespace][attr_name] = obj_value

      analysis += attr.analyze(obj_value, obj_key)

    for attr_name, attr_entries in self._attributes.items():
      for namespace, attr in attr_entries.items():
        if (not attr._optional) and not (attr_name in attr_values[namespace]):
          analysis.errors.append(MissingKeyError(f"{namespace}.{attr_name}", obj))

    analysis.completions.append(Completion(
      items=[CompletionItem(
        detail='foo',
        documentation='bar',
        kind='property',
        label=f"{namespace}.{attr_name}",
        text=attr_name
      ) for attr_name, attr_entries in self._attributes.items() for namespace, attr in attr_entries.items()],
      ranges=[obj_key.area.single_range() for obj_key in obj.keys()]
    ))

    return analysis


  #   for key, attr in self._template.items():
  #     if not key in obj:
  #       errors.append(MissingKeyError(key), target=obj)
  #       continue

  #     if isinstance(attr, Attribute):
  #       hovers.append(Hover([attr.label] + ([attr.description] if attr.description else list()), obj_key.locrange))

  #       attr_analysis = attr.analyze(obj[key])

  #       errors.extend(attr_analysis.errors)
  #       warnings.extend(attr_analysis.warnings)

  #       folds.extend(attr_analysis.folds)
  #       hovers.extend(attr_analysis.hovers)

  #   return Analysis(
  #     errors=errors,
  #     warnings=warnings,

  #     folds=folds,
  #     hovers=hovers
  #   )


if __name__ == "__main__":
  tree, _, _ = reader.loads("""

foo: bar
""")

  schema = Dict({
    'foo': Attribute(
      description="Great",
      label="Foo"
    )
  })

  analysis = schema.analyze(tree)
  print(analysis)

from collections import namedtuple
import math
import re
import regex

from ..reader import LocatedString, LocatedValue
from .schema import SchemaType


# Location = namedtuple("Location", ["column", "line"])

# class Location:
#   def __init__(self, column, line):
#     self.column = column
#     self.line = line

#   def range(self):
#     return Range(
#       self,
#       Location(self.column + 1, self.line)
#     )

#   def __repr__(self):
#     return f"[{self.line}:{self.column}]"


# class Range:
#   def __init__(self, start, end):
#     self.start = start
#     self.end = end

#   def __mod__(self, offset):
#     assert(self.start.line == self.end.line)

#     start, end = offset if isinstance(offset, tuple) else (offset, offset + 1)

#     return Range(
#       Location(line=self.start.line, column=(self.start.column + start)),
#       Location(line=self.start.line, column=(self.start.column + end))
#     )

#   def from_node(node):
#     return Range(
#       start=Location(column=node.start_mark.column, line=node.start_mark.line),
#       end=Location(column=node.end_mark.column, line=node.end_mark.line)
#     )

#   def __repr__(self):
#     return f"Range({self.start} -> {self.end})"


# class LocatedValue(str):
#   def __new__(cls, value, *args, **kwargs):
#     return super(LocatedValue, cls).__new__(cls, value)

#   def __init__(self, value, location, source):
#     self.location = location
#     self.source = source
#     self.value = value

#   def error(self, message, offset = None):
#     return LocatedError(message, location=(self.location % offset if offset else self.location), source=self.source)

#   # def __int__(self):
#   #   return LocatedValueInt(int(self), self.location, self.source)

#   def __getitem__(self, key):
#     start, stop, step = key.indices(len(self))
#     return LocatedValue(self.value[key], location=(self.location % (start, stop)), source=self.source)


# # class LocatedValueInt(int):
# #   def __new__(cls, value, *args, **kwargs):
# #     return super(LocatedValueInt, cls).__new__(cls, value)

# #   def __init__(self, value, location, source):
# #     self.location = location
# #     self.source = source
# #     self.value = value

# #   def __rmul__(self, other):
# #     print(self, other)


# class _LocatedValue:
#   def __init__(self, value, location, source):
#     self.location = location
#     self.source = source
#     self.value = value

#   def __hash__(self):
#     return hash(self.value)

#   def __eq__(self, other):
#     return self.value == other

#   def __repr__(self):
#     return self.value.__repr__()

#   def replace(self, *args):
#     return self

#   def error(self, message):
#     return LocatedError(message, location=self.location, source=self.source)

#   def split(self, delimiter):
#     # TODO
#     # assert(self.value is str)

#     index = 0
#     segments = list()

#     for segment in self.value.split(delimiter):
#       segments.append(LocatedValue(
#         segment,
#         location=(self.location % (index, index + (len(segment) or 1))),
#         source=self.source
#       ))

#       index += len(segment) + len(delimiter)

#     return segments

#   def __getitem__(self, key):
#     return self.value[key]

#   def startswith(self, prefix):
#     return self.value.startswith(prefix)


# class Source:
#   def __init__(self, value):
#     self.value = value

#   def parse_yaml(self):
#     return yaml.load(self.value, Loader=YamlLoader)


# class YamlLoader(yaml.SafeLoader):
#   def construct_mapping(self, node, deep = False):
#     mapping = super(YamlLoader, self).construct_mapping(node, deep=deep)
#     mapping['__location__'] = Range.from_node(node)
#     mapping['__source__'] = Source(self.buffer)
#     # print(">", node)

#     return mapping

#   def construct_scalar(self, node):
#     value = super().construct_scalar(node)
#     # print(">>", value, type(value), node.tag)

#     if node.tag == "tag:yaml.org,2002:str":
#       return LocatedValue(value=value, location=Range.from_node(node), source=Source(self.buffer))
#     # TODO: handle styles, e.g. "foobar" (with inner and outer range)
#     # print(">", node.style)

#     return value


# class LocatedError(Exception):
#   def __init__(self, message, location, source):
#     super().__init__(message)
#     self.location = location
#     self.source = source

#   # TODO: improve by trying to find block limits
#   def display(self):
#     location = self.location

#     # Options
#     context_before = 4
#     context_after = 2
#     target_space = False

#     lines = self.source.value.splitlines()
#     width_line = math.ceil(math.log(location.end.line + 1 + context_after + 1, 10))
#     end_line = location.end.line - (1 if location.end.column == 0 else 0)

#     for line_index, line in enumerate(lines):
#       if (line_index < location.start.line - context_before) or (line_index > end_line + context_after):
#         continue

#       print(f" {str(line_index + 1).rjust(width_line, ' ')} | {line}")

#       if (line_index >= location.start.line) and (line_index <= end_line):
#         target_offset = location.start.column if line_index == location.start.line else 0
#         target_width = (location.end.column if line_index == location.end.line else len(line))\
#           - (location.start.column if line_index == location.start.line else 0)

#         if not target_space:
#           target_line = line[target_offset:(target_offset + target_width)]
#           target_space_width = len(target_line) - len(target_line.lstrip())

#           if target_space_width < target_width:
#             target_offset += target_space_width
#             target_width -= target_space_width

#         print(
#           " " +
#           " " * width_line +
#           " | "
#           "\033[31m" +
#           " " * target_offset +
#           # "^" * (location.end.column - location.start.column) +
#           "^" * target_width +
#           "\033[39m"
#         )


## Identifiers

regexp_identifier = re.compile(r"^[a-zA-Z][a-zA-Z0-9]*$", re.ASCII)
regexp_identifier_alt = re.compile(r"^[a-zA-Z0-9]+$", re.ASCII)

def check_identifier(identifier, *, allow_leading_digit = False):
  regexp = regexp_identifier_alt if allow_leading_digit else regexp_identifier

  if not regexp.match(identifier.value):
    raise identifier.error(f"Invalid identifier literal '{identifier.value}'")


regexp_ref = re.compile(r"^\$([a-zA-Z0-9]+)", re.ASCII)

def parse_ref(expr):
  match = regexp_ref.match(expr)
  return (match.groups()[0], match.span()[1]) if match else None


class Identifier(SchemaType):
  def __init__(self, *, allow_leading_digit = False):
    super().__init__(str)
    self._allow_leading_digit = allow_leading_digit

  def validate(self, test):
    check_identifier(test, allow_leading_digit=self._allow_leading_digit)



## Calls

regexp_call = regex.compile(r"^(?P<n>[a-zA-Z][a-zA-Z0-9]*)\((?:\[(?P<a>.+)]|\\(?P<a>\[[^,]+)|(?P<a>[^,]+?))(?: *, *(?:\[(?P<a>.+)]|\\(?P<a>\[[^,]+)|(?P<a>[^,]+)))*\)$")

def parse_call(expr):
  match = regexp_call.match(expr)

  if not match:
    raise expr.error(f"Invalid call expression")

  callee_span = match.spans('n')[0]
  callee = expr[callee_span[0]:callee_span[1]]
  # callee = match.captures('n')[0]

  args = [expr[span[0]:span[1]] for span in match.spans('a')]

  return callee, args


## Interpolation
# TODO: add support for $<index> references

import re
interpolate_regexp = regex.compile(r"{([^}]*)}")

def interpolate(expr, context):
  result = list()
  index = 0

  for match in interpolate_regexp.finditer(expr):
    match_span = match.span()
    group_span = match.spans(1)[0]

    # try:
    #   value = eval(py_expr)
    # except Exception as e:
    #   raise expr[span[0]:span[1]].error(f"Invalid Python expression '{py_expr}', {e}")

    # result.append(expr[index:(span[0] - 1)])
    # result.append(value)

    result.append(expr[index:match_span[0]])
    # result.append(PythonExpr(expr[group_span[0]:group_span[1]], context=context))
    result.append(
      PythonExpr(expr[group_span[0]:group_span[1]], context=context)
    )

    index = match_span[1]

  result.append(expr[index:])

  return CompositeValue(result, location=expr.location)


class CompositeValue(LocatedValue):
  def __init__(self, fragments, location = None):
    super().__init__(self, location)
    self.fragments = fragments

  # def compose(self, globals = dict()):
  #   return "".join([str(frag.evaluate(globals)) if (index % 2) > 0 else frag for index, frag in enumerate(self.fragments)])

  def combine(self, globals = dict(), *, compose = False):
    def proc(fragments):
      frags = list()

      for index, frag in enumerate(fragments):
        if (index % 2) > 0:
          value = frag.evaluate(globals)

          if isinstance(value, CompositeValue):
            frags = [*frags, *proc(value.fragments)]
          else:
            frags.append(str(value) if compose else value)
        else:
          frags.append(frag)

      return frags

    return proc(self.fragments)

  def compose(self, globals = dict()):
    return "".join(self.combine(globals, compose=True))

  def evaluate(self, globals = dict()):
    frags = list()

    for index, frag in enumerate(self.fragments):
      if (index % 2) > 0:
        value = frag.evaluate(globals)

        if isinstance(value, CompositeValue):
          frags.append(value.evaluate())
        else:
          frags.append(value)
      else:
        frags.append(frag)

    return EvaluatedCompositeValue(frags, location=self.location)


  def __repr__(self):
    string = "".join([f"{frag}" if (index % 2) > 0 else frag for index, frag in enumerate(self.fragments)])
    return f"[Composite \"{string}\"]"

  def compose_value(value, globals = dict()):
    return value.compose(globals) if isinstance(value, CompositeValue) else value


class EvaluatedCompositeValue(LocatedValue):
  def __init__(self, fragments, location = None):
    super().__init__(self, location)
    self.fragments = fragments

  def __repr__(self):
    string = ", ".join([repr(frag) for index, frag in enumerate(self.fragments)])
    return f"[EvComposite {string}]"


# class InterpolatedValue:
#   def __init__(self, value, location, source):
#     self.value = value
#     self.location = location
#     self.source = source

#   def error(self, message, offset = None):
#     return LocatedError(message, location=(self.location % offset if offset else self.location), source=self.source)


class PythonExpr:
  def __init__(self, value, context):
    self.context = context
    self.value = value

  def evaluate(self, globals):
    try:
      result = eval(self.value, { 'args': self.context, **globals })
    except Exception as e:
      raise self.value.error(f"Invalid Python expression '{self.value}'; {f'{type(e).__name__}: {e.args[0]}' if hasattr(e, 'args') else repr(e)}")

    if type(result) == str:
      return LocatedString(result, self.value.location, symbolic=True)
    if type(result) == CompositeValue:
      return result
    else:
      return LocatedValue(result, self.value.location)

  def __repr__(self):
    return f"{{{self.value}}}"

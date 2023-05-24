from collections import namedtuple
import re
import regex

from ..fiber.expr import unescape
from ..reader import LocatedError, LocatedString, LocatedValue, Source
from .schema import SchemaType


## Identifiers

regexp_identifier = re.compile(r"^[a-zA-Z][a-zA-Z0-9_]*$", re.ASCII)
regexp_identifier_alt = re.compile(r"^[a-zA-Z0-9_]+$", re.ASCII)
regexp_identifier_start = re.compile(r"^[a-zA-Z][a-zA-Z0-9_]*", re.ASCII)

def is_identifier(raw_value: str, *, allow_leading_digit = False):
  regexp = regexp_identifier_alt if allow_leading_digit else regexp_identifier
  return regexp.match(raw_value)


class Identifier(SchemaType):
  def __init__(self, *, allow_leading_digit = False):
    super().__init__(str)
    self._allow_leading_digit = allow_leading_digit

  def validate(self, test):
    check_identifier(test, allow_leading_digit=self._allow_leading_digit)


class IdentifierPath(SchemaType):
  def __init__(self, *, length = None):
    super().__init__(str)
    self._length = length

  def transform(self, test):
    segments = test.split("/")

    if ((self._length is not None) and len(segments) != self._length) or (not segments):
      raise test.error(f"Invalid identifier path, expected {self._length} segments")

    Identifier().validate(segments[0])
    identifier = Identifier(allow_leading_digit=True)

    for segment in segments[1:]:
      identifier.validate(segment)

    return segments


## Command member arguments

regexp_member_unescaped = r'([^"\n][^ \n]*)'
regexp_member_escaped = r'"((?:\\[^\n]|[^"\n])*)"'
regexp_members = rf"(?:(?|{regexp_member_escaped}|{regexp_member_unescaped}) *)+"
regexp_command = regex.compile(rf"^{regexp_members}$")
# regexp_commands = regex.compile(...)

def parse_command(input_str: LocatedString, /):
  match = regexp_command.match(input_str)

  if not match:
    return Ellipsis

  return [unescape(input_str[group_span[0]:group_span[1]]) for group_span in match.spans(1)]


## Calls

regexp_arg = r"(?P<a>(:?[^,]|(?<=\\).)+?)"
regexp_args = rf"(?:{regexp_arg} *(?:(?<!\\), *{regexp_arg} *)*)?"
regexp_call = regex.compile(rf"^(?P<n>[a-zA-Z][a-zA-Z0-9]*)(?:\( *{regexp_args}\))?$")
regexp_escape = regex.compile(r"\\(.)")

def parse_call(expr):
  def unescape(value):
    return LocatedValue.transfer(regexp_escape.sub(r"\1", value), value)

  match = regexp_call.match(expr)

  if not match:
    raise expr.error(f"Invalid call expression")

  callee_span = match.spans('n')[0]
  callee = expr[callee_span[0]:callee_span[1]]
  # callee = match.captures('n')[0]

  # TODO: handle detached location
  args = [unescape(expr[span[0]:span[1]]) for span in match.spans('a')]

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

  return CompositeValue(result, location=expr.locrange)


class CompositeValue(LocatedValue):
  def __init__(self, fragments, location = None):
    super().__init__(self, location)
    self.fragments = fragments

  def evaluate(self, globals = dict()):
    frags = list()

    for index, frag in enumerate(self.fragments):
      if (index % 2) > 0:
        value = frag.evaluate(globals)

        if isinstance(value, CompositeValue):
          frags += value.evaluate(globals).fragments
        else:
          frags.append(value)
      else:
        frags.append(frag)

    return EvaluatedCompositeValue(frags, location=self.locrange)

  def get_single_expr(self):
    if (len(self.fragments) == 3) and (not self.fragments[0]) and (not self.fragments[-1]):
      return self.fragments[1]
    else:
      return None


  def __repr__(self):
    string = "".join([f"{{{frag}}}" if (index % 2) > 0 else frag for index, frag in enumerate(self.fragments)])
    return f"[Composite \"{string}\"]"


class EvaluatedCompositeValue(LocatedValue):
  def __init__(self, fragments, location = None):
    super().__init__(self, location)
    self.fragments = fragments

  def __repr__(self):
    string = ", ".join([repr(frag) for index, frag in enumerate(self.fragments)])
    return f"[EvComposite {string}]"

  def to_str(self):
    output = str()

    for frag in self.fragments:
      value = frag.value if isinstance(frag, LocatedValue) else value

      if isinstance(value, str) or isinstance(value, int):
        output += str(value)
      elif isinstance(value, UnclassifiedExpr):
        output += value.to_str()
      else:
        raise frag.error(f"Unexpected value {repr(value)}, expected str")

    return output



def create_utils(globals):
  def expr(unclassified_expr):
    expr = unclassified_expr.interpolate().get_single_expr()
    return LocatedValue.extract(expr.evaluate(globals)) if expr else unclassified_expr.to_str()

  return {
    'expr': expr
  }


class PythonExpr:
  def __init__(self, value, context):
    self.context = context
    self.value = value

  def evaluate(self, globals = dict()):
    try:
      result = eval(self.value, { 'args': self.context, **create_utils(globals), **globals })
    except LocatedError:
      raise
    except Exception as e:
      raise self.value.error(f"Invalid Python expression '{self.value}'; {f'{type(e).__name__}: {e.args[0]}' if hasattr(e, 'args') else repr(e)}")

    if type(result) == str:
      return LocatedString(result, self.value.locrange, symbolic=True)
    if type(result) == CompositeValue:
      return result
    else:
      return LocatedValue(result, self.value.locrange)

  def __repr__(self):
    return f"{{{self.value}}}"


class UnclassifiedExpr:
  def __init__(self, value, context):
    self.context = context
    self.value = value

  def interpolate(self):
    return interpolate(self.to_str(), self.context)

  def to_python(self):
    return PythonExpr(self.value, self.context)

  def to_str(self):
    return self.value

  def __repr__(self):
    return f"{{?? {self.value}}}"

  def __str__(self):
    return LocatedValue.extract(self.to_str())


if __name__ == "__main__":
  for x in [
    'yes no',
    'y\"es no',
    '"yes" no',
    '"yes no"',
    'y\\es no',
    '"y\\"es no"',
    '""'
  ]:
    p = parse_command(Source(x))
    print(x.ljust(10), p)

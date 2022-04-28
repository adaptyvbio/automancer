from collections import namedtuple
import math
import re
import regex

from ..reader import LocatedError, LocatedString, LocatedValue
from .schema import SchemaType


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
# ^(?P<n>[a-zA-Z][a-zA-Z0-9]*)(:?\(.*\))?$

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

    return EvaluatedCompositeValue(frags, location=self.location)


  def __repr__(self):
    string = "".join([f"{{{frag}}}" if (index % 2) > 0 else frag for index, frag in enumerate(self.fragments)])
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

  def to_str(self):
    output = str()

    for frag in self.fragments:
      value = frag.value if isinstance(frag, LocatedValue) else value

      if isinstance(value, str) or isinstance(value, int):
        output += str(value)
      elif isinstance(value, UnclassifiedExpr):
        output += value.to_str()
      else:
        raise LocatedValue.create_error(f"Unexpected value {repr(value)}, expected str", value)

    return output



def create_utils(globals):
  def expr(unclassified_expr):
    return LocatedValue.extract(unclassified_expr.to_python().evaluate(globals))

  return {
    'expr': expr
  }


class PythonExpr:
  def __init__(self, value, context):
    self.context = context
    self.value = value

  def evaluate(self, globals):
    try:
      result = eval(self.value, { 'args': self.context, **create_utils(globals), **globals })
    except LocatedError:
      raise
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


class UnclassifiedExpr:
  def __init__(self, value, context):
    self.context = context
    self.value = value

  def to_python(self):
    return PythonExpr(self.value, self.context)

  def to_str(self):
    return self.value

  def __str__(self):
    return LocatedValue.extract(self.to_str())

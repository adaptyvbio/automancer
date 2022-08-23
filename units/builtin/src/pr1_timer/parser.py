import regex

from pr1.units.base import BaseParser
from pr1.util.parser import UnclassifiedExpr, interpolate
from pr1.reader import LocatedError, LocatedValue

from . import namespace


class Parser(BaseParser):
  def parse_block(self, data_block):
    if 'duration' in data_block:
      return { 'role': 'process' }

  def handle_segment(self, data_block):
    if 'duration' in data_block:
      raw_expr, context = data_block['duration']

      return {
        namespace: { 'duration': parse_duration(raw_expr, context) }
      }

  def export_segment(data):
    return {
      'duration': data['duration']
    }


def parse_duration(raw_expr, context):
  python_expr = interpolate(raw_expr, context).get_single_expr()

  if python_expr:
    def dur(input):
      if isinstance(input, UnclassifiedExpr):
        return parse_duration(input.value, input.context)

      try:
        return parse_duration_expr(input)
      except LocatedError:
        raise
      except Exception as e:
        raise raw_expr.error(e.args[0])

    evaluated = python_expr.evaluate({
      'dur': dur
    })

    duration = evaluated.value

    if (not isinstance(duration, float)) and (not isinstance(duration, int)):
      raise evaluated.error(f"Unexpected value {repr(duration)}, expected scalar")
  else:
    duration = parse_duration_expr(raw_expr)

  return round(duration)


# ---


time_factors = {
  1: ["ms", "millsecond", "milliseconds"],
  1_000: ["s", "sec", "second", "seconds"],
  60_000: ["m", "min", "minute", "minutes"],
  3600_000: ["h", "hr", "hrs", "hour", "hours"]
}.items()

time_regexp = regex.compile(r"^ *(?:(\d+(?:\.\d*)?|\d*\.\d+) *([a-z]+) *)+$")

def parse_duration_expr(expr):
  output = 0.0

  match = time_regexp.match(expr)

  if not match:
    raise LocatedValue.create_error(f"Invalid duration expression", expr)

  for quant, factor_name, factor_span in zip(match.captures(1), match.captures(2), match.spans(2)):
    factor = next(
      (factor for factor, keywords in time_factors if factor_name in keywords),
      None
    )

    if not factor:
      raise LocatedValue.create_error(f"Invalid duration keyword '{factor_name}'", expr[factor_span[0]:factor_span[1]])

    output += float(quant) * factor

  return output

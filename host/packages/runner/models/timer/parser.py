import regex


from ..base import BaseParser
from ...util.parser import interpolate


class Parser(BaseParser):
  def parse_action(self, data_action):
    if "duration" in data_action:
      return { 'role': 'process' }

  def handle_segment(self, data_action):
    if "duration" in data_action:
      expr, context = data_action["duration"]
      # expr_composed = interpolate(expr, context).compose()
      # print(expr_composed)
      value = parse_duration(expr, context)

      return {
        'duration': value
      }

  def export_segment(data):
    return {
      "duration": data['duration']
    }



# ---


time_factors = {
  1: ["s", "sec", "second", "seconds"],
  60: ["m", "min", "minute", "minutes"],
  3600: ["h", "hr", "hrs", "hour", "hours"]
}.items()

time_regexp = regex.compile(r"^ *(?:(\d+(?:\.\d*)?|\d*\.\d+) *([a-z]+) *)+$")
time_regexp = regex.compile(r"^ *(?:(?:(\d+(?:\.\d*)?|\d*\.\d+) *([a-z]+)|\$(\d+)) *)+$")


def parse_duration(expr, context = dict()):
  output = 0.0

  match = time_regexp.match(expr)

  if not match:
    raise expr.error("Invalid duration expression")

  for quant, factor_name, factor_span in zip(match.captures(1), match.captures(2), match.spans(2)):
    factor = next(
      (factor for factor, keywords in time_factors if factor_name in keywords),
      None
    )

    if not factor:
      raise expr[factor_span[0]:factor_span[1]].error("Invalid duration keyword")

    output += float(quant) * factor

  for ref_name, ref_span in zip(match.captures(3), match.spans(3)):
    if not (ref_name in context):
      raise expr[ref_span[0]:ref_span[1]].error(f"Invalid reference to '${ref_name}'")

    ref_value = context[ref_name]
    output += parse_duration(ref_value)

  return output

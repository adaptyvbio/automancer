from . import namespace
from ..base import BaseParser
from ...protocol import Parsers
from ...reader import LocatedValue
from ...util.parser import PythonExpr, UnclassifiedExpr, parse_call
from ...util import schema as sc


schema = sc.Dict({
  'shorthands': sc.Optional(sc.Dict({
    str: dict
  }))
}, allow_extra=True)

class ShorthandsParser(BaseParser):
  def __init__(self, protocol):
    super().__init__(protocol)
    self._shorthands = dict()

  def enter_protocol(self, data_protocol):
    schema.validate(data_protocol)

    for name, data_shorthand in data_protocol.get('shorthands', dict()).items():
      self._shorthands[name] = data_shorthand

  def parse_block(self, data_block):
    if 'use' in data_block:
      call_expr, context = data_block['use']
      callee, args = parse_call(call_expr)
      shorthand = self._shorthands.get(callee)

      if not shorthand:
        raise LocatedValue.create_error(f"Invalid shorthand name '{callee}'", callee)

      context = { index: UnclassifiedExpr(arg, context) for index, arg in enumerate(args) }

      return {
        'role': 'replace',
        'data': LocatedValue.transfer({ # TODO: use multiple locations
          **{ key: value for key, value in data_block.items() if key != "use" },
          **{ key: (value, context) for key, value in shorthand.items() }
        }, data_block)
      }


class FragmentParser(BaseParser):
  def parse_block(self, data_block):
    if 'actions' in data_block:
      actions, context = data_block['actions']

      return {
        'role': 'collection',
        'actions': [LocatedValue.transfer({ key: (value, context) for key, value in action.items() }, action) for action in actions]
      }


class ConditionParser(BaseParser):
  priority = 1000

  def parse_block(self, data_block):
    if 'if' in data_block:
      expr = PythonExpr(data_block['if'][0], data_block['if'][1])
      located_value = expr.evaluate()
      value = located_value.value

      if not isinstance(value, bool):
        raise located_value.error(f"Unexpected value {repr(value)}, expected bool")

      if not value:
        return {
          'role': 'none'
        }


class Parser(Parsers):
  def __init__(self, protocol):
    super().__init__(protocol, {
      (namespace + '.condition'): ConditionParser,
      (namespace + '.fragment'): FragmentParser,
      (namespace + '.shorthands'): ShorthandsParser
    })

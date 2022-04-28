from . import namespace
from ..base import BaseParser
from ...protocol import Parsers
from ...reader import LocatedValue
from ...util.parser import interpolate, parse_call


class ShorthandsParser(BaseParser):
  def __init__(self, parent):
    self._parent = parent
    self._shorthands = dict()

  def enter_protocol(self, data_protocol):
    for name, data_shorthand in data_protocol.get('shorthands', dict()).items():
      self._shorthands[name] = data_shorthand

  def parse_block(self, data_block):
    if 'use' in data_block:
      call_expr, context = data_block["use"]
      callee, args = parse_call(call_expr)
      shorthand = self._shorthands.get(callee)

      if not shorthand:
        raise LocatedValue.create_error(f"Invalid shorthand name '{callee}'", shorthand)

      args_composed = [interpolate(arg, context) for arg in args]
      context = { index: arg for index, arg in enumerate(args_composed) }

      return {
        'role': 'replace',
        'data': LocatedValue.transfer({ # TODO: use multiple locations
          **{ key: value for key, value in data_block.items() if key != "use" },
          **{ key: (value, context) for key, value in shorthand.items() }
        }, data_block)
      }


class FragmentParser(BaseParser):
  def __init__(self, master):
    self._master = master

  def parse_block(self, data_block):
    if 'actions' in data_block:
      actions, context = data_block['actions']

      return {
        'role': 'collection',
        'actions': [LocatedValue.transfer({ key: (value, context) for key, value in action.items() }, action) for action in actions]
      }


class Parser(Parsers):
  def __init__(self, protocol):
    super().__init__(protocol, {
      (namespace + '.fragment'): FragmentParser,
      (namespace + '.shorthands'): ShorthandsParser
    })

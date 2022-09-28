from pr1.units.base import BaseParser
from pr1.util import schema as sc

from . import namespace


capture_schema = sc.Schema({
  'exposure': sc.ParseType(int),
  'objective': str,
  'optconf': str,
  'save': str
})


class Parser(BaseParser):
  def __init__(self, parent):
    self._parent = parent
    self._executor = parent.host.executors[namespace]

  def parse_block(self, data_block):
    if 'capture' in data_block:
      return {
        'role': 'process'
      }

  def handle_segment(self, data_action):
    if 'capture' in data_action:
      capture, _context = data_action['capture']
      capture = capture_schema.transform(capture)

      if not capture['objective'] in self._executor._objectives:
        raise capture['objective'].error("Invalid objective")

      if not capture['optconf'] in self._executor._optconfs:
        raise capture['optconf'].error("Invalid optical configuration")

      if capture['exposure'] < 1:
        raise capture['exposure'].error("Invalid exposure")

      if not "{}" in capture['save']:
        raise capture['save'].error("Missing '{}' to specify chip index")

      return {
        namespace: {
          'exposure': capture['exposure'],
          'objective': capture['objective'],
          'optconf': capture['optconf'],
          'output_path': capture['save']
        }
      }

  def export_segment(data):
    return {
      "exposure": data['exposure'],
      "objective": data['objective'],
      "optconf": data['optconf']
    }

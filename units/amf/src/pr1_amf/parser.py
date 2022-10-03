from pr1.reader import LocatedValue
from pr1.units.base import BaseParser
from pr1.util import schema as sc
from pr1.util.parser import CompositeValue, Identifier, UnclassifiedExpr

from . import namespace


class Parser(BaseParser):
  protocol_keys = {'rotation_aliases'}

  def __init__(self, parent):
    self._executor = parent.host.executors[namespace]
    self._parent = parent

    self._aliases = dict()
    self._valves = { device.id: None for device in self._executor._devices.values() }

  def _parse_valve(self, data_value: UnclassifiedExpr):
    composite_value = data_value.interpolate()
    python_expr = composite_value.get_single_expr()

    if python_expr:
      evaluated = python_expr.evaluate()
      value = evaluated.value
      value_located = evaluated

      if isinstance(value, UnclassifiedExpr):
        value = value.to_str()
    else:
      value = data_value.to_str()
      value_located = value

    try:
      valve = int(value)
    except:
      if value in self._aliases:
        return self._aliases[value]
      else:
        raise value_located.error("Invalid valve")

    return LocatedValue.transfer(valve, value_located)

  def parse_block(self, data_block):
    if 'wait_rotation' in data_block:
      return { 'role': 'process' }

  def enter_protocol(self, data_protocol):
    if 'rotation_aliases' in data_protocol:
      sc.Schema(dict).validate(data_protocol['rotation_aliases'])

      for alias, data_valve in data_protocol['rotation_aliases'].items():
        Identifier().validate(alias)
        self._aliases[alias] = self._parse_valve(UnclassifiedExpr(data_valve, None))

  def handle_segment(self, data_segment):
    for device in self._executor._devices.values():
      attr = f"{device.id}.rotation"

      if attr in data_segment:
        valve = self._parse_valve(UnclassifiedExpr(*data_segment[attr]))

        if not (1 <= valve.value <= device._valve_count):
          raise valve.error(f"Invalid valve for '{device.label}', expected a number between 1 and {device._valve_count}")

        self._valves[device.id] = valve.value

    return {
      namespace: { 'valves': dict(self._valves) }
    }

  def export_segment(data):
    return {
      "valves": data['valves']
    }

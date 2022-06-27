from collections import namedtuple
import re
import regex

from . import namespace
from .sheet import display_partial_schema
from ..base import BaseParser
from ...util.parser import Identifier, UnclassifiedExpr, interpolate
from ...util import schema as sc


regexp_query_atom = regex.compile(r"^([a-zA-Z][a-zA-Z0-9]*)(?:(?:\.([a-zA-Z][a-zA-Z0-9]*))|(\*))?", re.ASCII)

ValveParameter = namedtuple("ValveParameter", ['default_valve_indices', 'display', 'label', 'name', 'repr'])


# Schemas

protocol_schema = sc.Dict({
  'parameters': sc.Optional(sc.SimpleDict(key=Identifier(), value=sc.Noneable({
    **display_partial_schema,
    'default': sc.Optional(str),
    'name': sc.Optional(str)
  }))),
  'valves': sc.Optional(str)
}, allow_extra=True)


class Parser(BaseParser):
  def __init__(self, parent):
    self._block_stack = list()
    self._valve_stack = list()
    self._parent = parent
    self._valve_parameters = list()

  @property
  def _depth(self):
    return len(self._valve_stack)

  def enter_protocol(self, data_protocol):
    data_protocol = protocol_schema.transform(data_protocol)

    for valve_name, valve_info_raw in data_protocol.get('parameters', dict()).items():
      valve_info = valve_info_raw or dict()

      self._valve_parameters.append(
        ValveParameter(
          default_valve_indices={
            model_id: model.sheets[namespace].valve_names.get(valve_info['default']) for model_id, model in self._parent.models.items()
          } if ('default' in valve_info) and (self._parent.models) else None,
          display=(valve_info['display'].value if valve_info and ('display' in valve_info) else None),
          label=(valve_info['name'].value if valve_info and ('name' in valve_info) else valve_name.value),
          name=valve_name.value,
          repr=(valve_info['repr'].value if valve_info and ('repr' in valve_info) else None)
        )
      )

    if 'valves' in data_protocol:
      self._process_valves(data_protocol['valves'])
    else:
      self._process_valves()

  def leave_protocol(self, data_protocol):
    self._block_stack.pop()

    # if self._depth > 0:
    #   raise data_protocol['stages'].error("Final depth is non-null")


  def enter_block(self, data_block):
    if 'valves' in data_block:
      data_valves, context = data_block['valves']
      sc.Schema(str).validate(data_valves)
      self._process_valves(data_valves, context)
    else:
      self._process_valves()

  def leave_block(self, data_block):
    self._block_stack.pop()

  def handle_segment(self, data_segment):
    return {
      namespace: {
        'valves': self._block_stack[-1] ^ (self._valve_stack[-1] if self._valve_stack else set())
        # 'valves': self._block_stack[-1] ^ (self._valve_stack[-1:] or [set()])[0]
      }
    }

  def export_protocol(self):
    return {
      "parameters": [{
        "defaultValveIndices": param.default_valve_indices,
        "display": param.display,
        "label": param.label,
        "repr": param.repr
      } for param in self._valve_parameters],
    }

  def create_supdata(self, chip, codes):
    code = codes[namespace]

    def process_arg(param_index, arg):
      param = self._valve_parameters[param_index]
      valve = chip.model.sheets[namespace].valves[arg] if arg is not None else None

      return {
        'display': param.display or (valve and valve.default_display) or 'visible',
        'repr': param.repr or (valve and valve.repr or param.repr) or 'flow'
      }

    arguments = [process_arg(param_index, arg) for param_index, arg in enumerate(code['arguments'])]

    return {
      'arguments': arguments
    }

  def export_segment(data):
    return {
      "valves": list(data['valves'])
    }

  def export_supdata(data):
    return {
      "arguments": [{
        "display": arg['display'],
        "repr": arg['repr']
      } for arg in data['arguments']]
    }

  def _process_valves(self, expr = None, context = dict()):
    if expr:
      pop_count, pushes, peak = self._parse_expr(expr, context)

      for _ in range(pop_count):
        if len(self._valve_stack) <= 1:
          raise expr.error(f"Invalid pop instruction, stack is already empty")

        self._valve_stack.pop()
    else:
      pushes = list()
      peak = None

    for push in pushes:
      self._valve_stack.append(push ^ (self._valve_stack[-1] if self._valve_stack else set()))

    self._block_stack.append((peak if peak else set()) ^ (self._block_stack[-1] if self._block_stack else set()))


  def _resolve_atom_query(self, token): # <--------- TODO: Remove that
    query_name = token['value']
    range_end = token['range_end']
    wildcard = token['wildcard']

    valves = set()

    for valve_index, valve_param in enumerate(self._valve_parameters):
      if (not wildcard) and (valve_param.name == query_name)\
        or wildcard and valve_param.name.startswith(query_name) and (len(valve_param.name) > len(query_name)):
        valves.add(valve_index)

    if len(valves) < 1:
      raise query_name.error(f"Invalid query atom")

    # etc.

    return valves

    # for target_name, target_index in sheet.valves_names.items():
    #   if (
    #     (wildcard is None) and (target_name == name)
    #   ) or (
    #     (range_end is not None) and (target_name >= name) and (target_name <= range_end)
    #   ) or (
    #     (wildcard is not None) and target_name.startswith(name) and (len(target_name) > len(name))
    #   ):
    #     valves.add(target_index)


  def _parse_expr(self, expr, context):
    tokens = self._tokenize_expr(interpolate(expr, context).evaluate().fragments)

    pop_count = 0
    pushes = list()
    peak = None

    comma = False
    selection = None
    state = 0

    def create_error(message = None):
      return token['data'].error(message or f"Unexpected token '{token['data']}'")

    for token in tokens:
      # (0) Detect pop tokens
      if state == 0:
        if token['kind'] == 'pop':
          pop_count += 1
        else:
          state = 1

      # (1) Detect push or peak tokens
      if state == 1:
        if token['kind'] == 'push':
          state = 2
          selection = set()
          continue
        elif token['kind'] == 'peak':
          state = 3
          selection = set()
          continue
        elif (token['kind'] == 'query_atom') or (token['kind'] == 'fragment'):
          state = 3
          selection = set()
        else:
          raise create_error()

      # (2) Accept push or (3) Accept peak
      if state >= 2:
        if (token['kind'] == 'query_atom') and ((not selection) or comma):
          selection |= self._resolve_atom_query(token)
          comma = False
        elif (token['kind'] == 'fragment') and ((not selection) or comma):
          comma = False
          selection |= token['query']
        elif (token['kind'] == 'comma') and selection and (not comma):
          comma = True
        elif ((token['kind'] == 'push') or (token['kind'] == 'peak')) and (not comma) and (state == 2):
          pushes.append(selection)
          selection = set()
          state = 2 if token['kind'] == 'push' else 3
        else:
          raise create_error()

    if state == 2:
      pushes.append(selection)
    if state == 3:
      peak = selection
    if comma:
      raise create_error()

    return pop_count, pushes, peak


  def _parse_query(self, fragments):
    tokens = self._tokenize_expr(fragments)
    comma = True
    result = set()

    def create_error(message = None):
      return token['data'].error(message or f"Unexpected token '{token['kind']}'")

    for token in tokens:
      if (not comma) and (token['kind'] == 'comma'):
        comma = True
      elif comma and (token['kind'] == 'query_atom'):
        comma = False
        result |= self._resolve_atom_query(token)
      elif comma and (token['kind'] == 'fragment'):
        comma = False
        result |= token['query']
      else:
        raise create_error()

    if comma:
      raise create_error()

    return result


  # fragments: EvaluatedCompositeValue
  def _tokenize_expr(self, fragments) -> list:
    tokens = list()

    for fragment_index, fragment in enumerate(fragments):
      if (fragment_index % 2) < 1:
        index = 0

        while index < len(fragment.value):
          ch = fragment[index]
          query_atom_match = regexp_query_atom.match(fragment.value[index:])
          # ref_match = parse_ref(fragment.value[index:])

          if query_atom_match:
            groups = query_atom_match.groups()
            span = query_atom_match.span()
            value_span = query_atom_match.spans(1)[0]

            tokens.append({
              'kind': 'query_atom',
              'data': fragment[(index + span[0]):(index + span[1])],
              'range_end': groups[1],
              'value': fragment[(index + value_span[0]):(index + value_span[1])],
              'wildcard': groups[2] is not None
            })

            index += span[1] - 1
          # elif ref_match:
          #   ref_name, length = ref_match
          #   tokens.append({ 'kind': 'ref', 'name': ref_name, 'data': (index, index + length) })
          #   index += length - 1
          elif ch == ">":
            tokens.append({ 'kind': 'push', 'data': ch })
          elif ch == "<":
            tokens.append({ 'kind': 'pop', 'data': ch })
          elif ch == "-":
            tokens.append({ 'kind': 'mark', 'data': ch })
          elif ch == "|":
            tokens.append({ 'kind': 'peak', 'data': ch })
          elif ch == ",":
            tokens.append({ 'kind': 'comma', 'data': ch })
          elif ch != " ":
            raise ch.error(f"Invalid token '{ch}'")

          index += 1
      else:
        if isinstance(fragment.value, UnclassifiedExpr):
          query = fragment.value.interpolate().evaluate().fragments
        elif isinstance(fragment, str):
          query = [fragment]
        else:
          raise fragment.error(f"Invalid fragment of type '{type(fragment.value).__name__}'")

        tokens.append({
          'kind': 'fragment',
          'query': self._parse_query(query),
          'data': fragment
        })

    return tokens

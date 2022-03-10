import re
import regex

from . import namespace
from ..base import BaseParser
from ...util.parser import EvaluatedCompositeValue, check_identifier, interpolate, parse_ref


regexp_query_atom = regex.compile(r"^([a-zA-Z][a-zA-Z0-9]*)(?:(?:\.([a-zA-Z][a-zA-Z0-9]*))|(\*))?", re.ASCII)
# regexp_identifier = re.compile(r"^[a-zA-Z][a-zA-Z0-9]*$", re.ASCII)


class Parser(BaseParser):
  def __init__(self, parent):
    self._stack = [set()]
    # self._depth = None
    self._parent = parent
    self._valve_parameters = list()

  def enter_protocol(self, data_protocol):
    for valve_name in data_protocol.get("parameters", list()):
      check_identifier(valve_name)
      self._valve_parameters.append(valve_name.value)


    # self._depth = 0

    # if "defaults" in data_protocol:
    #   self._process_defaults(data_protocol["defaults"])

  def enter_stage(self, stage_index, data_stage):
    # if "defaults" in data_stage:
    #   self._process_defaults(data_stage["defaults"])

    pass

  def parse_action(self, data_action):
    # if "defaults" in data_action:
    #   data_defaults, context = data_action["defaults"]
    #   self._process_defaults(data_defaults, context)

    if "valves" in data_action:
      data_valves, context = data_action["valves"]
      self._process_valves(data_valves, context)

      return {
        'data': {
          'valves': self._stack[-1]
        },
        'role': None
      }


  def _process_valves(self, expr, context = dict()):
    pop_count, pushes = self._parse_expr(expr, context)

    for _ in range(pop_count):
      if len(self._stack) < 1:
        raise expr.error(f"Invalid pop instruction")

      self._stack.pop()

    for push in pushes:
      self._stack.append(push ^ (self._stack[-1] if len(self._stack) > 0 else set()))


  # def _check_identifier(self, identifier):
  #   if not regexp_identifier.match(identifier.value):
  #     raise self._parent.create_error(f"Invalid identifier literal {identifier.value}", location=identifier.location)

  # def _resolve_valve(self, name):
  #   if not name.value in self._parameters:
  #     raise self._parent.create_error(f"Invalid valve name '{name.value}'", location=name.location)

  #   return self._parameters.index(name.value)

  def _resolve_atom_query(self, token):
    query_name = token['value']
    range_end = token['range_end']
    wildcard = token['wildcard']

    valves = set()

    for valve_index, valve_name in enumerate(self._valve_parameters):
      if (not wildcard) and (valve_name == query_name)\
        or (wildcard is not None) and valve_name.startswith(query_name) and (len(valve_name) > len(query_name)):
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
    # print(interpolate(expr, context).evaluate())
    tokens = self._tokenize_expr(interpolate(expr, context).evaluate().fragments)

    pop_count = 0
    pushes = list()

    comma = False
    selection = None
    state = 0

    def create_error(message = None):
      return token['data'].error(message or f"Unexpected token '{token['kind']}'")

    for token in tokens:
      if state == 0:
        if token['kind'] == 'minus':
          pop_count += 1
        else:
          state = 1

      if state == 1:
        if token['kind'] == 'plus':
          state = 2
          selection = set()
          continue
        elif (token['kind'] == 'query_atom') or (token['kind'] == 'ref'):
          pop_count += 1
          state = 2
          selection = set()
        else:
          raise create_error()

      if state == 2:
        if (token['kind'] == 'query_atom') and ((not selection) or comma):
          selection |= self._resolve_atom_query(token)
          comma = False
        elif (token['kind'] == 'fragment') and ((not selection) or comma):
          comma = False
          selection |= token['query']
        elif (token['kind'] == 'comma') and selection and (not comma):
          comma = True
        elif (token['kind'] == 'plus') and (not comma):
          pushes.append(selection)
          selection = set()
        else:
          raise create_error()

    if state == 2:
      pushes.append(selection)
    if comma:
      raise create_error()

    return pop_count, pushes


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


  # expr_fragments: EvaluatedCompositeValue
  def _tokenize_expr(self, fragments):
    tokens = list()

    def create_error():
      return expr.error(f"Unexpected token '{ch}'", offset=index)

    symbol = False

    for fragment_index, fragment in enumerate(fragments):
      if (fragment_index % 2) < 1:
        index = 0

        while index < len(fragment.value):
          ch = fragment[index]
          query_atom_match = regexp_query_atom.match(fragment.value[index:])
          ref_match = parse_ref(fragment.value[index:])

          if query_atom_match:
            groups = query_atom_match.groups()
            span = query_atom_match.span()
            value_span = query_atom_match.spans(1)[0]

            # print(fragment.value[(index + span[0]):(index + span[1])])
            # print(fragment.value[(index + value_span[0]):(index + value_span[1])])

            # print(query_atom_match.spans(1))

            tokens.append({
              'kind': 'query_atom',
              'data': fragment[(index + span[0]):(index + span[1])],
              # 'span': (index, span[1] + index),
              'range_end': groups[1],
              'value': fragment[(index + value_span[0]):(index + value_span[1])],
              'wildcard': groups[2] is not None
            })

            index += span[1] - 1
          elif symbol:
            raise create_error()
          elif ref_match:
            ref_name, length = ref_match
            tokens.append({ 'kind': 'ref', 'name': ref_name, 'span': (index, index + length) })
            index += length - 1
          # elif ch == "%":
          #   symbol = True
          elif ch == "+":
            tokens.append({ 'kind': 'plus', 'data': ch })
          elif ch == "-":
            tokens.append({ 'kind': 'minus', 'data': ch })
          elif ch == "=":
            tokens.append({ 'kind': 'equals', 'data': ch })
          elif ch == "*":
            tokens.append({ 'kind': 'star', 'data': ch })
          elif ch == "^":
            tokens.append({ 'kind': 'xor', 'data': ch })
          elif ch == ",":
            tokens.append({ 'kind': 'comma', 'data': ch })
          elif ch != " ":
            raise ch.error("Invalid token")

          index += 1
      else:
        # if not isinstance(fragment, str):
        #   raise fragment.error("Invalid fragment")

        if isinstance(fragment, EvaluatedCompositeValue):
          query = fragment.fragments
        elif isinstance(fragment, str):
          query = [fragment]
        else:
          raise fragment.error(f"Invalid fragment of type '{type(fragment.value).__name__}'")

        tokens.append({
          'kind': 'fragment',
          'query': self._parse_query(query),
          'data': fragment
        })

    if symbol:
      raise create_error()

    return tokens

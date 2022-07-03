from collections import namedtuple
import re
import regex

from . import namespace
from .sheet import entity_schema
from ..base import BaseParser
from ...util.parser import Identifier, UnclassifiedExpr, interpolate, regexp_identifier_start
from ...util import schema as sc


regexp_query_atom = regex.compile(r"^([a-zA-Z][a-zA-Z0-9]*)(?:(?:\.([a-zA-Z][a-zA-Z0-9]*))|(\*))?", re.ASCII)

Entity = namedtuple("Entity", ['display', 'label', 'repr'])
ValveParameter = namedtuple("ValveParameter", ['default_valve_indices', 'param_indices_encoded'])

def encode_indices(items):
  return sum([1 << item for item in set(items)])


# Schemas

def parse_list(raw_list):
  return [item.strip() for item in raw_list.split(",")]

protocol_schema = sc.Dict({
  'valve_aliases': sc.Optional(sc.SimpleDict(key=Identifier(), value=sc.Or({
    **entity_schema,
    'alias': str,
    'label': sc.Optional(str)
  }, str))),
  'valve_parameters': sc.Optional(sc.SimpleDict(key=Identifier(), value=sc.Noneable({
    **entity_schema,
    'default': sc.Optional(sc.Transform(parse_list, str)),
    'label': sc.Optional(str),
    'imply': sc.Optional(str)
  }))),
  'valves': sc.Optional(str)
}, allow_extra=True)


class Parser(BaseParser):
  protocol_keys = {'valve_aliases', 'valve_parameters', 'valves'}

  def __init__(self, parent):
    self._block_stack = list()
    self._valve_stack = list()
    self._parent = parent
    self._entities = dict()
    self._valve_aliases = list()
    self._valve_names = dict()
    self._valve_parameters = list()

  @property
  def _depth(self):
    return len(self._valve_stack)

  def enter_protocol(self, data_protocol):
    data_protocol = protocol_schema.transform(data_protocol)


    # -- Parse parameters ---------------------------------

    def register_entity(name, obj, param_indices):
      param_indices_encoded = encode_indices(param_indices)

      if not param_indices_encoded in self._entities:
        self._entities[param_indices_encoded] = Entity(
          display=(obj['display'].value if obj and ('display' in obj) else 'active'),
          label=(obj['label'].value if obj and ('label' in obj) else name.value),
          repr=(obj['repr'].value if obj and ('repr' in obj) else None)
        )

      if name in self._valve_names:
        raise name.error(f"Duplicate name '{name}'")

      self._valve_names[name] = param_indices
      return param_indices_encoded

    for valve_name, valve_info_raw in data_protocol.get('valve_parameters', dict()).items():
      valve_info = valve_info_raw or dict()
      default_valve_indices = dict()

      if 'default' in valve_info:
        if not self._parent.models:
          raise valve_info['default'].error("No models referenced")

        for ref in valve_info['default']:
          try:
            colon_index = ref.index(":")
          except ValueError:
            ref_model_ids = list(self._parent.models.keys())
            ref_valve_name = ref
          else:
            ref_model_ids = [ref[0:colon_index]]
            ref_valve_name = ref[(colon_index + 1):]

          ref_match = False

          for ref_model_id in ref_model_ids:
            ref_model = self._parent.models.get(ref_model_id)

            if not ref_model:
              raise ref_model_id.error(f"Invalid chip model id '{ref_model_id}'")

            ref_valve_index = ref_model.sheets[namespace].valve_names.get(ref_valve_name)

            if (ref_valve_index is not None) and not (ref_model_id in default_valve_indices):
              default_valve_indices[ref_model_id] = ref_valve_index
              ref_match = True

          if not ref_match:
            raise ref_valve_name.error(f"Invalid valve name '{ref_valve_name}'")

      if 'imply' in valve_info:
        implication = self._parse_query([valve_info['imply']])
      else:
        implication = set()

      param_indices = {len(self._valve_parameters)} | implication
      param_indices_encoded = register_entity(valve_name, valve_info, param_indices)

      self._valve_parameters.append(
        ValveParameter(
          default_valve_indices=default_valve_indices,
          param_indices_encoded=param_indices_encoded,
        )
      )


    # -- Parse aliases ------------------------------------

    for name, alias in data_protocol.get('valve_aliases', dict()).items():
      if isinstance(alias, str):
        alias = { 'alias': alias }

      param_indices = self._parse_query([alias['alias']])
      register_entity(name, alias, param_indices)


    # -- Process root valves ------------------------------

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

  def leave_block(self, _data_block):
    self._block_stack.pop()

  def handle_segment(self, data_segment):
    return {
      namespace: {
        'valves': self._block_stack[-1] ^ (self._valve_stack[-1] if self._valve_stack else set())
      }
    }

  def export_protocol(self):
    return {
      "entities": {
        param_indices_encoded: {
          "display": entity.display,
          "label": entity.label,
          "repr": entity.repr
        } for param_indices_encoded, entity in self._entities.items()
      },
      "parameters": [{
        "defaultValveIndices": param.default_valve_indices,
        "paramIndicesEncoded": str(param.param_indices_encoded)
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
      "paramIndices": list(data['valves'])
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
        if len(self._valve_stack) < 1:
          raise expr.error(f"Invalid pop instruction, stack is already empty")

        self._valve_stack.pop()
    else:
      pushes = list()
      peak = None

    for push in pushes:
      self._valve_stack.append(push ^ (self._valve_stack[-1] if self._valve_stack else set()))

    self._block_stack.append((peak if peak else set()) ^ (self._block_stack[-1] if self._block_stack else set()))


  def _resolve_atom_query(self, token):
    query_name = token['value']
    query_selection = self._valve_names.get(query_name)

    if query_selection is None:
      raise query_name.error(f"Invalid query atom")

    return query_selection


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
    query_selection = set()

    def create_error(message = None):
      return token['data'].error(message or f"Unexpected token '{token['kind']}'")

    for token in tokens:
      if (not comma) and (token['kind'] == 'comma'):
        comma = True
      elif comma and (token['kind'] == 'query_atom'):
        comma = False
        query_selection |= self._resolve_atom_query(token)
      elif comma and (token['kind'] == 'fragment'):
        comma = False
        query_selection |= token['query']
      else:
        raise create_error()

    if comma:
      raise create_error()

    return query_selection


  # fragments: EvaluatedCompositeValue
  def _tokenize_expr(self, fragments):
    tokens = list()

    for fragment_index, fragment in enumerate(fragments):
      if (fragment_index % 2) < 1:
        index = 0

        while index < len(fragment.value):
          ch = fragment[index]
          query_atom_match = regexp_identifier_start.match(fragment.value[index:])

          if query_atom_match:
            span = query_atom_match.span()
            value = fragment[(index + span[0]):(index + span[1])]

            tokens.append({
              'kind': 'query_atom',
              'data': value,
              'value': value
            })

            index += span[1] - 1
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

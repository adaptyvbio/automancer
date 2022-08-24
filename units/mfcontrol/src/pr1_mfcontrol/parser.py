import re
from collections import namedtuple

import regex
from pr1.reader import LocatedValue
from pr1.units.base import BaseParser
from pr1.util import schema as sc
from pr1.util.parser import Identifier, UnclassifiedExpr, interpolate, regexp_identifier_start

from . import namespace
from .model import entity_schema


regexp_query_atom = regex.compile(r"^([a-zA-Z][a-zA-Z0-9]*)(?:(?:\.([a-zA-Z][a-zA-Z0-9]*))|(\*))?", re.ASCII)

Entity = namedtuple("Entity", ['display', 'label', 'repr'])
ValveParameter = namedtuple("ValveParameter", ['channel_index', 'param_indices_encoded'])

def encode_indices(items):
  return sum([1 << item for item in set(items)])


# Schemas

protocol_schema = sc.Dict({
  'valve_aliases': sc.Optional(sc.SimpleDict(key=Identifier(), value=sc.Or({
    **entity_schema,
    'alias': str,
    'label': sc.Optional(str)
  }, str))),
  'valve_model': sc.Optional(str),
  'valve_parameters': sc.Optional(sc.SimpleDict(key=Identifier(), value=sc.Noneable({
    **entity_schema,
    'label': sc.Optional(str),
    'imply': sc.Optional(str)
  }))),
  'valves': sc.Optional(str)
}, allow_extra=True)


class Parser(BaseParser):
  protocol_keys = {'valve_aliases', 'valve_model', 'valve_parameters', 'valves'}

  def __init__(self, parent):
    self._block_stack = list()
    self._valve_stack = list()
    self._parent = parent
    self._entities = dict()
    self._model = None
    self._valve_aliases = list()
    self._valve_names = dict()
    self._valve_parameters = list()

  @property
  def _depth(self):
    return len(self._valve_stack)

  def enter_protocol(self, data_protocol):
    data_protocol = protocol_schema.transform(data_protocol)


    def register_entity(name, obj, param_indices):
      param_indices_encoded = encode_indices(param_indices)

      if not param_indices_encoded in self._entities:
        self._entities[param_indices_encoded] = Entity(
          display=(LocatedValue.extract(obj['display']) if obj and ('display' in obj) else 'active'),
          label=(LocatedValue.extract(obj['label']) if obj and ('label' in obj) else name.value),
          repr=(LocatedValue.extract(obj['repr']) if obj and ('repr' in obj) else None)
        )

      if name in self._valve_names:
        raise name.error(f"Duplicate name '{name}'")

      self._valve_names[name] = param_indices
      return param_indices_encoded


    # -- Parse model --------------------------------------

    model_id = data_protocol.get('valve_model')

    if model_id:
      models = self._parent.host.executors[namespace].models

      if not (model_id in models):
        raise model_id.error(f"Invalid chip model id '{model_id}'")

      self._model = models[model_id]

      for channel_index, channel in enumerate(self._model.channels):
        valve_info = {
          'label': channel.label,
          'repr': channel.repr
        }

        param_indices_encoded = register_entity(channel.id, valve_info, {len(self._valve_parameters)})

        self._valve_parameters.append(
          ValveParameter(
            channel_index=channel_index,
            param_indices_encoded=param_indices_encoded
          )
        )


    # -- Parse parameters ---------------------------------

    for valve_name, valve_info_raw in data_protocol.get('valve_parameters', dict()).items():
      valve_info = valve_info_raw or dict()

      if 'imply' in valve_info:
        implication = self._parse_query([valve_info['imply']])
      else:
        implication = set()

      param_indices = {len(self._valve_parameters)} | implication
      param_indices_encoded = register_entity(valve_name, valve_info, param_indices)

      self._valve_parameters.append(
        ValveParameter(
          channel_index=None,
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
      "modelId": (self._model and self._model.id),
      "parameters": [{
        "channelIndex": param.channel_index,
        "paramIndicesEncoded": str(param.param_indices_encoded)
      } for param in self._valve_parameters],
    }

  def export_segment(data):
    return {
      "paramIndices": list(data['valves'])
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

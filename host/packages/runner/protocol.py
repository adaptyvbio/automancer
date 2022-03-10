from collections import namedtuple
import math
import re

from .models.base import BaseParser
from .util.parser import interpolate, parse_call
from .reader import parse
from .models.timer.parser import Parser as TimerParser


Stage = namedtuple("Stage", ["name", "steps"])
Step = namedtuple("Step", ["description", "name", "segment_indices"])

# Fragment = namedtuple("Fragment", ["actions"])
Segment = namedtuple("Segment", ["data", "process_namespace"])


class BuiltinParser(BaseParser):
  def __init__(self, parent):
    self._parent = parent
    self._shorthands = dict()

  def enter_protocol(self, data_protocol):
    for name, data_shorthand in data_protocol.get("shorthands", dict()).items():
      self._shorthands[name] = data_shorthand

  def parse_action(self, data_action):
    if "use" in data_action:
      call_expr, context = data_action["use"]
      callee, args = parse_call(call_expr)
      shorthand = self._shorthands.get(callee)

      if not shorthand:
        raise callee.error(f"Invalid shorthand name '{callee}'")

      args_composed = [interpolate(arg, context) for arg in args]
      context = { index: arg for index, arg in enumerate(args_composed) }

      return {
        'role': 'replace',
        'depth': 0,
        'data': {
          **{ key: value for key, value in data_action.items() if key != "use" },
          **{ key: (value, context) for key, value in shorthand.items() }
        }
      }



  def _parse_action(self, data_action):
    if "use" in data_action:
      data_use, context = data_action["use"]
      for name, args in data_use.items():
        shorthand = self._shorthands.get(name)

        if not shorthand:
          raise name.error(f"Invalid shorthand name '{name}'")

        context = { str(index): arg for index, arg in enumerate(args) }

        return {
          'role': 'replace',
          'depth': 0,
          'data': {
            **{ key: value for key, value in data_action.items() if key != "use" },
            **{ key: (value, context) for key, value in shorthand.items() }
          }
          # 'data': [
          #   { 'data': data_action, 'context': dict() },
          #   { 'data': self._shorthands[name], 'context': { index: arg for index, arg in enumerate(args) } }
          # ]
        }

  # def _parse_action(self, data_action):
  #   if "actions" in data_action:
  #     return {
  #       'role': 'fragment',
  #       'actions': data_action["actions"]
  #     }


class InputParser(BaseParser):
  def __init__(self, master):
    self._master = master

  def parse_action(self, data_action):
    if "confirm" in data_action:
      message, context = data_action["confirm"]

      return {
        'role': 'process',
        'data': {
          'message': message
        }
      }

class FragmentParser(BaseParser):
  def __init__(self, master):
    self._master = master

  def parse_action(self, data_action):
    if "actions" in data_action:
      actions, context = data_action["actions"]

      return {
        'role': 'fragment',
        'actions': [{ key: (value, context) for key, value in action.items() } for action in actions]
      }

# class RepeatParser(BaseParser):
#   def parse_action(self, data_action):
#     if "repeat" in data_action:
#       repeat, context = data_action["repeat"]

#       return {
#         'role': 'fragment',
#         'actions': [
#           { key: value for key, value in data_action.items() if key != "repeat" }
#         ] * repeat
#       }


# ---


class Protocol:
  def __init__(self, path, parsers, chip_models):
    data = parse(path.open().read())


    parsers = {
      "builtin": BuiltinParser,
      "fragment": FragmentParser,
      # "repeat": RepeatParser,
      "input": InputParser,
      "timer": TimerParser,
      **parsers
    }

    self.parsers = { namespace: Parser(self) for namespace, Parser in parsers.items() }

    self.chip_models = dict()
    self.segments = list()
    self.stages = list()

    # self.name = data.get("name")
    self.name = data["name"].value if "name" in data else None


    # Get chip model instances from their ids
    for id in data.get("models", list()):
      if not (id.value in chip_models):
        raise id.error(f"Invalid chip model id '{id.value}'")

      self.chip_models[id] = chip_models[id]


    # call enter_protocol()
    for parser in self.parsers.values():
      parser.enter_protocol(data)

    for stage_index, data_stage in enumerate(data.get("stages", list())):
      stage = Stage(
        name=data_stage.get("name", f"Stage #{stage_index + 1}"),
        steps=list()
      )

      self.stages.append(stage)

      # call enter_stage()
      for parser in self.parsers.values():
        parser.enter_stage(stage_index, data_stage)

      def add_context(props):
        return { key: (value, dict()) for key, value in props.items() }

      for step_index, data_step in enumerate(data_stage.get("steps", list())):
        step = Step(
          description=data_step.get("description"),
          name=data_step.get("name", f"Step #{step_index + 1}"),
          segment_indices=self.parse_action(add_context(data_step))
        )

        stage.steps.append(step)

      # call leave_stage()
      for parser in self.parsers.values():
        parser.leave_stage(stage_index, data_stage)


  def parse_action(self, data_action):
    data = dict()
    role = None

    # data_props = {
    #   key: (value, dict()) for key, value in data_action.items()
    # }

    while True:
      for namespace, parser in self.parsers.items():
        parser_result = parser.parse_action(data_action)

        if parser_result:
          parser_role = parser_result['role']

          if parser_role and role:
            raise Exception("Action role is already defined")
          elif parser_role == 'process':
            role = { 'type': 'process', 'namespace': namespace }
          elif parser_role == 'replace':
            data_action = parser_result['data']
            break
          elif parser_role == 'fragment':
            role = { 'type': 'fragment', 'actions': parser_result['actions'] }
          elif parser_role is not None:
            raise Exception(f"Unknown parser role '{parser_role}'")

          data[namespace] = parser_result.get('data')
      else:
        break


    start_index = len(self.segments)

    if role:
      if role['type'] == 'process':
        segment = Segment(
          data=data,
          process_namespace=role['namespace']
        )

        self.segments.append(segment)

        return start_index, start_index + 1

      if role['type'] == 'fragment':
        end_index = start_index

        for data_action in role['actions']:
          _, end_index = self.parse_action(data_action)

        return start_index, end_index

    return start_index, start_index

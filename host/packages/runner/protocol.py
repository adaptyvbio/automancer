from collections import namedtuple
import math
import re

from .models.base import BaseParser
from .util.parser import interpolate, parse_call
from .reader import parse
from .models.timer.parser import Parser as TimerParser


Stage = namedtuple("Stage", ["name", "seq", "steps"])
Step = namedtuple("Step", ["description", "name", "seq"])

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
        'role': 'collection',
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


    # Call enter_protocol()
    for parser in self.parsers.values():
      parser.enter_protocol(data)

    for stage_index, data_stage in enumerate(data.get("stages", list())):
      steps = list()

      # Call enter_stage()
      for parser in self.parsers.values():
        parser.enter_stage(stage_index, data_stage)

      def add_context(props):
        return { key: (value, dict()) for key, value in props.items() }

      for step_index, data_step in enumerate(data_stage.get("steps", list())):
        step = Step(
          description=data_step.get("description"),
          name=data_step.get("name", f"Step #{step_index + 1}"),
          seq=self.parse_action(add_context(data_step))
        )

        steps.append(step)

      # Compute the stage's seq
      if steps:
        seq = (steps[0].seq[0], steps[-1].seq[1])
      else:
        seq_start = len(self.segments)
        seq = (seq_start, seq_start)

      # Call leave_stage()
      for parser in self.parsers.values():
        parser.leave_stage(stage_index, data_stage)

      stage = Stage(
        name=data_stage.get("name", f"Stage #{stage_index + 1}"),
        seq=seq,
        steps=steps
      )

      self.stages.append(stage)


  def parse_action(self, data):
    # Call prepare_block()
    role = None
    role_namespace = None

    for namespace, parser in self.parsers.items():
      parser_role = parser.parse_action(data)

      if parser_role:
        if role:
          raise Exception(f"Block role is already defined as '{role['role']}' by '{role_namespace}', cannot be redefined to '{parser_role['role']}' by '{namespace}'")

        role = parser_role
        role_namespace = namespace

    # Start again if a model returned a replacement
    if role['role'] == 'replace':
      return self.parse_action(role['data'])

    # Store current segment index
    start_index = len(self.segments)
    seq = start_index, start_index

    # Call enter_block()
    for namespace, parser in self.parsers.items():
      parser.enter_block(data)

    # Create a segment if a model declared itself responsible for a process
    if role['role'] == 'process':
      segment_data = dict()

      # Call handle_segment()
      for namespace, parser in self.parsers.items():
        segment_data_model = parser.handle_segment(data)

        if segment_data_model:
          segment_data[namespace] = segment_data_model

      segment = Segment(
        data=segment_data,
        process_namespace=role_namespace
      )

      self.segments.append(segment)

      seq = start_index, start_index + 1

    # Enumerate children blocks if a model returned a collection
    elif role['role'] == 'collection':
      start_index = len(self.segments)

      for data_action in role['actions']:
        _, end_index = self.parse_action(data_action)

      seq = start_index, end_index
    elif role['role'] is not None:
      raise Exception(f"Unknown role '{role['role']}'")

    # Call leave_block()
    for namespace, parser in self.parsers.items():
      parser.leave_block(data)


    return seq

from collections import namedtuple
import math
import re

from . import reader
from .reader import LocatedValue
from .units.base import BaseParser
from .util import schema as sc
from .util.parser import interpolate


Stage = namedtuple("Stage", ["name", "seq", "steps"])
Step = namedtuple("Step", ["description", "name", "seq"])

Segment = namedtuple("Segment", ["data", "process_namespace"])


class Parsers(BaseParser):
  def __init__(self, protocol, Parsers):
    self.parsers = {
      namespace: Parser(protocol) for namespace, Parser in sorted(Parsers.items(), key=lambda item: -item[1].priority)
    }

  @property
  def protocol_keys(self):
    return {key for parser in self.parsers.values() for key in parser.protocol_keys}

  def enter_protocol(self, data_protocol):
    for parser in self.parsers.values():
      parser.enter_protocol(data_protocol)

  def leave_protocol(self, data_protocol):
    for parser in self.parsers.values():
      parser.leave_protocol(data_protocol)

  def enter_stage(self, stage_index, data_stage):
    for parser in self.parsers.values():
      parser.enter_stage(stage_index, data_stage)

  def leave_stage(self, stage_index, data_stage):
    for parser in self.parsers.values():
      parser.leave_stage(stage_index, data_stage)


  def parse_block(self, data_block):
    for namespace, parser in self.parsers.items():
      parser_result = parser.parse_block(data_block)

      if parser_result:
        if isinstance(parser_result, tuple):
          parser_claim, parser_claim_namespace = parser_result
        else:
          parser_claim = parser_result
          parser_claim_namespace = namespace

        return parser_claim, parser_claim_namespace

    return None

  def enter_block(self, data_block):
    for parser in self.parsers.values():
      parser.enter_block(data_block)

  def leave_block(self, data_block):
    for parser in self.parsers.values():
      parser.leave_block(data_block)


  def handle_segment(self, data_segment):
    data = dict()

    for parser in self.parsers.values():
      parser_data = parser.handle_segment(data_segment)

      if parser_data:
        data.update(parser_data)

    return data



# ---


class Protocol:
  def __init__(self, text, parsers, *, host):
    self.host = host
    self.parser_classes = parsers
    self.parser = Parsers(self, parsers)

    protocol_schema = sc.Dict({
      'name': sc.Optional(str),
      'stages': sc.Optional(sc.List(sc.Dict({
        'name': sc.Optional(str),
        'steps': sc.List(sc.Dict({
          'name': sc.Optional(str)
        }, allow_extra=True))
      }, allow_extra=True))),
      **({ key: sc.Optional(sc.Any()) for key in self.parser.protocol_keys }),
    })

    data = reader.parse(text)
    data = protocol_schema.transform(data)

    self.segments = list()
    self.stages = list()

    self.name = data['name'].value if 'name' in data else None


    # Call enter_protocol()
    self.parser.enter_protocol(data)

    for stage_index, data_stage in enumerate(data.get('stages', list())):
      steps = list()

      # Call enter_stage()
      self.parser.enter_stage(stage_index, data_stage)

      def add_context(props):
        return LocatedValue.transfer({ key: (value, dict()) for key, value in props.items() }, props)

      for step_index, data_step in enumerate(data_stage.get('steps', list())):
        seq, name = self.parse_block(add_context(data_step))

        step = Step(
          description=data_step.get('description'),
          name=(name or f"Step #{step_index + 1}"),
          seq=seq
        )

        steps.append(step)

      # Compute the stage's seq
      if steps:
        seq = (steps[0].seq[0], steps[-1].seq[1])
      else:
        seq_start = len(self.segments)
        seq = (seq_start, seq_start)

      # Call leave_stage()
      self.parser.leave_stage(stage_index, data_stage)

      stage = Stage(
        name=data_stage.get("name", f"Stage #{stage_index + 1}"),
        seq=seq,
        steps=steps
      )

      self.stages.append(stage)

    # Call leave_protocol()
    self.parser.leave_protocol(data)

    # from pprint import pprint
    # pprint(self.segments)

  def export(self):
    return {
      "name": self.name,
      "data": {
        namespace: parser.export_protocol() for namespace, parser in self.parser.parsers.items()
      },
      "segments": [{
        "data": {
          namespace: self.parser_classes[namespace].export_segment(data) for namespace, data in segment.data.items()
        },
        "processNamespace": segment.process_namespace
      } for segment in self.segments],
      "stages": [{
        "name": stage.name,
        "seq": stage.seq,
        "steps": [{
          "name": step.name,
          "seq": step.seq
        } for step in stage.steps]
      } for stage in self.stages]
    }


  def parse_block(self, data_block, depth = 0):
    if depth > 50:
      raise LocatedValue.create_error("Maximum recursion depth exceeded", data_block)

    # Call parse_block()
    claim_result = self.parser.parse_block(data_block)

    if not claim_result:
      raise LocatedValue.create_error("No role claimed for block", data_block)

    claim, claim_namespace = claim_result

    role = claim['role']

    # Start again if a unit returned a replacement block
    if role == 'replace':
      return self.parse_block(claim['data'], depth=(depth + 1))

    # Store current segment index
    start_index = len(self.segments)
    seq = start_index, start_index

    # Call enter_block()
    self.parser.enter_block(data_block)

    # Create a segment if a model declared itself responsible for a process
    if role == 'process':
      # Call handle_segment()
      segment_data = self.parser.handle_segment(data_block)

      segment = Segment(
        data=segment_data,
        process_namespace=claim_namespace
      )

      self.segments.append(segment)

      seq = start_index, start_index + 1

    # Enumerate children blocks if a model returned a collection
    elif role == 'collection':
      start_index = len(self.segments)

      for data_action in claim['actions']:
        (_, end_index), _ = self.parse_block(data_action, depth=(depth + 1))

      seq = start_index, end_index

    # Ignore block
    elif role == 'none':
      seq = start_index, start_index

    else:
      raise LocatedValue.create_error(f"Unknown role '{role}' claimed by unit '{claim_namespace}'", data_block)

    # Call leave_block()
    self.parser.leave_block(data_block)

    name = interpolate(data_block['name'][0], data_block['name'][1]).evaluate().to_str() if 'name' in data_block else None

    return seq, name

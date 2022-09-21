from collections import namedtuple

from . import langservice as lang
from .. import reader
from ..draft import DraftDiagnostic
from ..util import schema as sc


def debug(cls):
  def repr_cls(self):
    props = ", ".join(f"{key}={repr(value)}" for key, value in self.__dict__.items())
    return f"{type(self).__name__}({props})"

  setattr(cls, '__repr__', repr_cls)
  return cls


@debug
class MissingProcessError(Exception):
  def __init__(self, target):
    self.target = target

  def diagnostic(self):
    return DraftDiagnostic(f"Missing process", ranges=self.target.area.ranges)


AcmeState = namedtuple('AcmeState', ['value'])

class AcmeParser:
  namespace = "acme"

  root_attributes = {
    'microscope': lang.Attribute(
      description=["`acme.microscope`", "Microscope settings"],
      optional=True,
      type=lang.SimpleDict({
        'exposure': lang.Attribute(
          description=["`exposure`", "Camera exposure"],
          detail="Exposure time in seconds",
          type=lang.AnyType()
        ),
        'zzz': lang.Attribute(type=lang.AnyType())
      }, foldable=True)
    ),
    'value': lang.Attribute(
      label="Value",
      detail="Value of the object",
      description=["`acme.value`", "The value for the acme device."],
      optional=True,
      type=lang.PrimitiveType(float)
    ),
    'wait': lang.Attribute(
      label="Wait for a fixed delay",
      detail="Wait for a delay",
      optional=True,
      type=lang.AnyType()
    )
  }

  segment_attributes = {
    'activate': lang.Attribute(
      description=["#### ACTIVATE", 'Type: int'],
      optional=True,
      type=lang.PrimitiveType(int)
    )
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def enter_protocol(self, data_protocol):
    pass

  def parse_block_state(self, block_attrs, parent_state):
    attrs = block_attrs[self.namespace]

    if 'activate' in attrs:
      value = attrs['activate'].value
      return AcmeState(value) if value is not Ellipsis else Ellipsis
    else:
      return None

  def parse_block(self, block_attrs, block_state):
    if block_state[self.namespace]:
      segment = self._fiber.register_segment(self.namespace)
      return AcmeActivateBlock(segment)


    # attrs = block_attrs[self.namespace]

    # if 'activate' in attrs:
    #   value = attrs['activate'].value

    #   if value is Ellipsis:
    #     return Ellipsis

    #   segment = self._fiber.register_segment(self.namespace, { 'value': value })
    #   return AcmeActivateBlock(segment)

    return None


@debug
class AcmeActivateBlock:
  def __init__(self, segment):
    self._segment = segment

  def activate(self):
    pass

  @property
  def first_segment(self):
    return self._segment

  @property
  def last_segment(self):
    return self._segment


# ----


ScoreState = namedtuple("ScoreState", ['value'])

class ScoreParser:
  namespace = "score"
  root_attributes = dict()
  segment_attributes = {
    'score': lang.Attribute(optional=True, type=lang.PrimitiveType(float))
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def enter_protocol(self, data_protocol):
    pass

  def parse_block_state(self, block_attrs, parent_state):
    attrs = block_attrs[self.namespace]
    return ScoreState((parent_state.value if parent_state else 0.0) + (attrs['score'].value if 'score' in attrs else 0.0))

  def parse_block(self, block_attrs, block_state):
    return None


# ----


class ConditionParser:
  namespace = "condition"

  root_attributes = dict()
  segment_attributes = {
    'if': lang.Attribute(optional=True, type=lang.AnyType())
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def enter_protocol(self, data_protocol):
    pass

  def parse_block_state(self, data_block, parent_state):
    return None

  def parse_block(self, data_block, block_state):
    if 'if' in data_block[self.namespace]:
      data_others = { key: value for key, value in data_block.items() if key != 'if' }
      # data_others = data_block.exclude('if')

      child_block = self._fiber.parse_block(data_others)
      return ConditionBlock(child_block, condition=data_block[self.namespace]['if'])

    return None


@debug
class ConditionBlock:
  def __init__(self, child_block, condition):
    self._child_block = child_block
    self._condition = condition

  def activate(self):
    self._child_block.activate()
    self.first_segment.pre_nodes.append(ConditionNode(
      condition=self._condition,
      target=self.last_segment.post_head
    ))

  @property
  def first_segment(self):
    return self._child_block.first_segment

  @property
  def last_segment(self):
    return self._child_block.last_segment


@debug
class ConditionNode:
  def __init__(self, condition, target):
    self._condition = condition
    self._target = target


# ----


class DoParser:
  namespace = "do"

  root_attributes = dict()
  segment_attributes = {
    'do': lang.Attribute(optional=True, type=lang.AnyType())
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def enter_protocol(self, data_protocol):
    pass

  def parse_block_state(self, block_attrs, parent_state):
    return None

  def parse_block(self, block_attrs, block_state):
    attrs = block_attrs[self.namespace]

    if 'do' in attrs:
      # return self._fiber.parse_attributes({ **self._fiber.segment_dict.merge(block_attrs, attrs['do']), self.namespace: dict() })
      return self._fiber.parse_block(attrs['do'])

    return None


# ----


class ShorthandsParser:
  namespace = "shorthands"

  root_attributes = {
    'shorthands': lang.Attribute(
      optional=True,
      type=lang.PrimitiveType(dict)
    )
  }

  # segment_attributes = {
  #   'use': lang.Attribute(optional=True, type=lang.PrimitiveType(str))
  # }

  def __init__(self, fiber):
    self._fiber = fiber
    self._shorthands = dict()

  @property
  def segment_attributes(self):
    return { shorthand_name: lang.Attribute(optional=True, type=lang.AnyType()) for shorthand_name in self._shorthands.keys() }

  def enter_protocol(self, data_protocol):
    for shorthand_name, data_shorthand in data_protocol.get('shorthands', dict()).items():
      self._shorthands[shorthand_name] = self._fiber.parse_block_dict(data_shorthand)
      # shorthand_analysis, shorthand_output = self._fiber.segment_dict.analyze(data_shorthand)
      # self._fiber.analysis += shorthand_analysis

  def parse_block_state(self, data_block, parent_state):
    return None

  def parse_block(self, data_block, block_state):
    data = { **data_block, self.namespace: dict() }

    for shorthand_name, shorthand_output in self._shorthands.items():
      if shorthand_name in data_block[self.namespace]:
        data = self._fiber.segment_dict.merge(data, shorthand_output)

    return self._fiber.parse_attributes(data) if data_block[self.namespace] else None


# ----


class SequenceParser:
  namespace = "sequence"
  root_attributes = dict()
  segment_attributes = {
    'actions': lang.Attribute(optional=True, type=lang.AnyType())
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def enter_protocol(self, data_protocol):
    pass

  def parse_block_state(self, data_block, parent_state):
    return None

  def parse_block(self, block_attrs, block_state):
    attrs = block_attrs[self.namespace]

    if 'actions' in attrs:
      children = list()

      for data_action in attrs['actions']:
        child_block = self._fiber.parse_block(data_action)

        if child_block is not Ellipsis:
          children.append(child_block)

      return SequenceBlock(children)


@debug
class SequenceBlock:
  def __init__(self, children):
    self._children = children

  def activate(self):
    for index, child_block in enumerate(self._children):
      child_block.activate()

      if index < (len(self._children) - 1):
        next_child_block = self._children[index + 1]
        child_block.last_segment.post_nodes.append(GotoPostNode(target=(next_child_block.first_segment.index, None)))

  @property
  def first_segment(self):
    return self._children[0].first_segment

  @property
  def last_segment(self):
    return self._children[-1].last_segment


# ----


@debug
class GotoPostNode:
  def __init__(self, target):
    self._target = target

@debug
class Segment:
  def __init__(self, index, process_namespace, state):
    self.index = index
    self.process_namespace = process_namespace
    self.state = state

    self.pre_nodes = list()
    self.post_nodes = list()

  @property
  def post_head(self):
    return (self.index, len(self.post_nodes))


class FiberParser:
  def __init__(self, text, *, host, parsers):
    self._parsers = [Parser(self) for Parser in [SequenceParser, DoParser, AcmeParser, ScoreParser]] # [ShorthandsParser, ConditionParser, SequenceParser, AcmeParser]]


    self.analysis = lang.Analysis()

    data, reader_errors, reader_warnings = reader.loads(text)

    self.analysis.errors += reader_errors
    self.analysis.warnings += reader_warnings

    schema = lang.CompositeDict({
      'name': lang.Attribute(
        label="Protocol name",
        description=["`name`", "The protocol's name."],
        optional=True,
        type=lang.AnyType()
      ),
      'steps': lang.Attribute(
        description=["`steps`", "Protocol steps"],
        type=lang.AnyType()
      )
    }, foldable=True)

    for parser in self._parsers:
      schema.add(parser.root_attributes, namespace=parser.namespace)

    from pprint import pprint
    # pprint(schema._attributes)
    # print(schema.get_attr("name")._label)

    analysis, output = schema.analyze(data)
    self.analysis += analysis

    for parser in self._parsers:
      parser.enter_protocol(output[parser.namespace])


    self._block_states = list()
    self._segments = list()

    data_actions = output['_']['steps']

    entry_block = self.parse_block(data_actions)

    if entry_block is not Ellipsis:
      entry_block.activate()

    print()

    print("<= ANALYSIS =>")
    print("Errors >", self.analysis.errors)
    print()

    if entry_block is not Ellipsis:
      print("<= ENTRY =>")
      print(entry_block.first_segment.index)
      print()

    print("<= SEGMENTS =>")
    pprint(self._segments)

  @property
  def segment_dict(self):
    schema_dict = lang.CompositeDict()

    for parser in self._parsers:
      schema_dict.add(parser.segment_attributes, namespace=parser.namespace)

    return schema_dict

  def parse_block_dict(self, data_dict):
    dict_analysis, dict_output = self.segment_dict.analyze(data_dict)
    self.analysis += dict_analysis
    return dict_output

  def parse_block(self, data_block):
    block_attrs = self.parse_block_dict(data_block)
    block_state = dict()

    for parser in self._parsers:
      unit_state = parser.parse_block_state(block_attrs, parent_state=(self._block_states[-1][parser.namespace] if self._block_states else None))

      if unit_state is Ellipsis:
        return Ellipsis

      block_state[parser.namespace] = unit_state

    self._block_states.append(block_state)

    for parser in self._parsers:
      result = parser.parse_block(block_attrs, block_state)

      if result is not None:
        self._block_states.pop()
        return result

    self.analysis.errors.append(MissingProcessError(data_block))
    return Ellipsis

  # def parse_attributes(self, attributes):
  #   for parser in self._parsers:
  #     result = parser.parse_block(attributes, None)

  #     if result is not None:
  #       return result

  #   raise Exception("No process candidate for ", attributes)

  def register_segment(self, process_namespace):
    segment = Segment(
      index=len(self._segments),
      process_namespace=process_namespace,
      state=self._block_states[-1]
    )

    self._segments.append(segment)
    return segment


if __name__ == "__main__":
  p = FiberParser("""
steps:
  score: 2
  actions:
    - activate: 4
    - activate: 3
      score: 16.3
""", host=None, parsers=None)

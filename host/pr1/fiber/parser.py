from . import langservice as lang
from .. import reader
from ..util import schema as sc


def debug(cls):
  def repr_cls(self):
    props = ", ".join(f"{key}={repr(value)}" for key, value in self.__dict__.items())
    return f"{type(self).__name__}({props})"

  setattr(cls, '__repr__', repr_cls)
  return cls


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
    'activate': lang.Attribute(type=lang.AnyType())
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def enter_protocol(self, data_protocol):
    print("Acme root >", data_protocol)

  def parse_block_state(self, data_block, parent_state):
    return None

  def parse_block(self, data_block, block_state):
    if 'activate' in data_block:
      segment = self._fiber.register_segment(self.namespace, { 'value': data_block['activate'] })
      return AcmeActivateBlock(segment)

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


class ConditionParser:
  namespace = "condition"

  root_attributes = dict()
  segment_attributes = {
    'if': lang.Attribute(type=lang.AnyType())
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def enter_protocol(self, data_protocol):
    pass

  def parse_block_state(self, data_block, parent_state):
    return None

  def parse_block(self, data_block, block_state):
    if 'if' in data_block:
      data_others = { key: value for key, value in data_block.items() if key != 'if' }

      child_block = self._fiber.parse_block(data_others)
      return ConditionBlock(child_block, condition=data_block['if'])

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


# ---


class SequenceParser:
  namespace = "sequence"
  root_attributes = dict()
  segment_attributes = dict()

  def __init__(self, fiber):
    self._fiber = fiber

  def enter_protocol(self, data_protocol):
    pass

  def parse_block_state(self, data_block, parent_state):
    return None

  def parse_block(self, data_block, block_state):
    # dict destructuring
    # others = { key: value for key, value in data_block.items() if key != 'actions' }

    if 'actions' in data_block:
      children = list()

      for data_action in data_block['actions']:
        child_block = self._fiber.parse_block(data_action)
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
  def __init__(self, index, process_namespace, process_data, state):
    self.index = index
    self.process_data = process_data
    self.process_namespace = process_namespace
    self.state = state

    self.pre_nodes = list()
    self.post_nodes = list()

  @property
  def post_head(self):
    return (self.index, len(self.post_nodes))


class FiberParser:
  def __init__(self, text, *, host, parsers):
    self._parsers = [Parser(self) for Parser in [ConditionParser, SequenceParser, AcmeParser]]


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
    entry_block.activate()

    print()

    print("== ANALYSIS")
    print("Errors >", self.analysis.errors)
    print()

    print("== ENTRY")
    print(entry_block.first_segment.index)
    print()

    print("== SEGMENTS")
    pprint(self._segments)

  def parse_block(self, data_block):
    block_state = dict()

    for parser in self._parsers:
      block_state[parser.namespace] = parser.parse_block_state(data_block, parent_state=(self._block_states[-1][parser.namespace] if self._block_states else None))

    self._block_states.append(block_state)

    for parser in self._parsers:
      result = parser.parse_block(data_block, block_state=block_state[parser.namespace])

      if result is not None:
        self._block_states.pop()
        return result

    raise Exception("No process candidate for ", data_block)

  def register_segment(self, process_namespace, process_data):
    segment = Segment(
      index=len(self._segments),
      process_data=process_data,
      process_namespace=process_namespace,
      state=self._block_states[-1]
    )

    self._segments.append(segment)
    return segment


if __name__ == "__main__":
  p = FiberParser("""
acme.value: 42.3

steps:
  actions:
    - activate: yes
    - actions:
        - activate: yes
        - activate: yes
    - activate: no
      if: {{ False }}
""", host=None, parsers=None)

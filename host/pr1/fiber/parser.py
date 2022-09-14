from . import langservice as lang
from .. import reader
from ..util import schema as sc


# TODO: use decorator instead
class Debug:
  def __repr__(self):
    props = ", ".join(f"{key}={repr(value)}" for key, value in self.__dict__.items())
    return f"{type(self).__name__}({props})"


class AcmeParser:
  namespace = "acme"

  root_attributes = {
    'microscope': lang.Attribute(
      description=["`acme.microscope`", "Microscope settings"],
      type=lang.SimpleDict({
        'exposure': lang.Attribute(
          description=["`exposure`", "Camera exposure"],
          detail="Exposure time in seconds",
          type=lang.SimpleType()
        ),
        'zzz': lang.Attribute(type=lang.SimpleType())
      }, foldable=True)
    ),
    'value': lang.Attribute(
      label="Value",
      detail="Value of the object",
      description=["`acme.value`", "The value for the acme device."],
      optional=True,
      type=lang.SimpleType()
    ),
    'wait': lang.Attribute(
      label="Wait for a fixed delay",
      detail="Wait for a delay",
      optional=True,
      type=lang.SimpleType()
    )
  }

  segment_attributes = {
    'activate': lang.Attribute(type=lang.SimpleType())
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def enter_protocol(self, data_protocol):
    pass

  def parse_block_state(self, data_block, parent_state):
    return None

  def parse_block(self, data_block, block_state):
    if 'activate' in data_block:
      segment = self._fiber.register_segment(self.namespace, { 'value': data_block['activate'] })
      return AcmeActivateBlock(segment)

    return None


class AcmeActivateBlock(Debug):
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


class SequenceBlock(Debug):
  def __init__(self, children):
    self._children = children

  def activate(self):
    for index, child_block in enumerate(self._children[0:-1]):
      next_child_block = self._children[index + 1]

      child_block.activate()
      child_block.last_segment.post_nodes.append(GotoPostNode(target=(next_child_block.first_segment.index, None)))

  @property
  def first_segment(self):
    return self._children[0].first_segment

  @property
  def last_segment(self):
    return self._children[-1].last_segment


class GotoPostNode(Debug):
  def __init__(self, target):
    self._target = target

class Segment(Debug):
  def __init__(self, index, process_namespace, process_data, state):
    self.index = index
    self.process_data = process_data
    self.process_namespace = process_namespace
    self.state = state

    self.pre_nodes = list()
    self.post_nodes = list()


class FiberParser:
  def __init__(self, text, *, host, parsers):
    self._parsers = [Parser(self) for Parser in [SequenceParser, AcmeParser]]


    self.analysis = lang.Analysis()

    data, reader_errors, reader_warnings = reader.loads(text)

    self.analysis.errors += reader_errors
    self.analysis.warnings += reader_warnings

    schema = lang.CompositeDict({
      'name': lang.Attribute(
        label="Protocol name",
        description=["`name`", "The protocol's name."],
        optional=True,
        type=lang.SimpleType()
      ),
      'steps': lang.Attribute(
        description=["`steps`", "Protocol steps"],
        type=lang.SimpleType()
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

    print("== ENTRY")
    print(entry_block)
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
steps:
  actions:
    - activate: yes
    - actions:
        - activate: yes
        - activate: yes
    - activate: no
""", host=None, parsers=None)

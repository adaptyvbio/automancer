from collections import namedtuple

from . import langservice as lang
from .. import reader
from ..draft import DraftDiagnostic
from ..util import schema as sc
from ..util.decorators import debug


@debug
class MissingProcessError(Exception):
  def __init__(self, target):
    self.target = target

  def diagnostic(self):
    return DraftDiagnostic(f"Missing process", ranges=self.target.area.ranges)


@debug
class BlockData:
  def __init__(self, *, state = None, transforms = list()):
    self.state = state
    self.transforms = transforms


AcmeState = namedtuple('AcmeState', ['process', 'value'])

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

  def parse_block(self, block_attrs, parent_state):
    attrs = block_attrs[self.namespace]

    if 'activate' in attrs:
      value = attrs['activate'].value
      return BlockData(state=AcmeState(process=True, value=value)) if value is not Ellipsis else Ellipsis
    else:
      return BlockData()

  def transform_block(self, transform, block_state, block_transforms):
    return None


# ----


class ScoreParser:
  namespace = "score"
  root_attributes = dict()
  segment_attributes = {
    'score': lang.Attribute(optional=True, type=lang.PrimitiveType(float, allow_expr=True))
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def enter_protocol(self, data_protocol):
    pass

  def parse_block(self, block_attrs, parent_state):
    attrs = block_attrs[self.namespace]

    if ('score' in attrs) and (attrs['score'] is not Ellipsis):
      print(attrs['score'])
    #   result = PythonExpr.parse(attrs['score'])
    #   print(result)

      return BlockData(
        state=ScoreState((parent_state.value if parent_state else 0.0) + (attrs['score'].value if 'score' in attrs else 0.0))
      )
    else:
      return BlockData(state=ScoreState(0.0))

@debug
class ScoreState:
  def __init__(self, value):
    self.value = value

  @property
  def process(self):
    return False

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

  def parse_block(self, block_attrs, parent_state):
    attrs = block_attrs[self.namespace]

    if 'do' in attrs:
      return BlockData(transforms=[DoTransform(attrs['do'], parser=self)])
    else:
      return BlockData()

@debug
class DoTransform:
  def __init__(self, data_do, parser):
    self._data_do = data_do
    self._parser = parser

  def execute(self, block_state, block_transforms):
    return self._parser._fiber.parse_block(self._data_do, block_state, block_transforms)


# ----


class ShorthandsParser:
  namespace = "shorthands"

  root_attributes = {
    'shorthands': lang.Attribute(
      optional=True,
      type=lang.PrimitiveType(dict)
    )
  }

  def __init__(self, fiber):
    self._fiber = fiber
    self._shorthands = dict()

  @property
  def segment_attributes(self):
    return { shorthand_name: lang.Attribute(optional=True, type=lang.AnyType()) for shorthand_name in self._shorthands.keys() }

  def enter_protocol(self, data_protocol):
    for shorthand_name, data_shorthand in data_protocol.get('shorthands', dict()).items():
      self._shorthands[shorthand_name] = self._fiber.parse_block_state(data_shorthand)

  def parse_block(self, block_attrs, parent_state):
    attrs = block_attrs[self.namespace]
    state = None

    if attrs:
      for shorthand_name in attrs.keys():
        state = self._shorthands[shorthand_name]

      return BlockData(transforms=[
        ShorthandTransform(..., parser=self)
      ])
    else:
      return BlockData()

  def parse_block(self, block_attrs, block_state):
    state = block_state[self.namespace]

    if state:
      # new_state = { namespace: (block_state[namespace] or dict()) | (state[namespace] or dict()) for namespace in set(block_state.keys()) | set(state.keys()) }
      return self._fiber.parse_part(state)

    return None


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

  def parse_block(self, block_attrs, parent_state):
    attrs = block_attrs[self.namespace]

    if 'actions' in attrs:
      return BlockData(transforms=[
        SequenceTransform(attrs['actions'], parser=self)
      ])
    else:
      return BlockData()

  def transform_block(self, transform, block_state, block_transforms):
    children = list()

    for data_action in transform._data_actions:
      child = self._fiber.parse_block(data_action, block_state, block_transforms)

      if child is not Ellipsis:
        children.append(child)

    return SequenceBlock(children)


@debug
class SequenceTransform:
  def __init__(self, data_actions, parser):
    self._data_actions = data_actions
    self._parser = parser

  def execute(self, block_state, block_transforms):
    children = list()

    for data_action in self._data_actions:
      child = self._parser._fiber.parse_block(data_action, block_state, block_transforms)

      if child is not Ellipsis:
        children.append(child)

    return SequenceBlock(children)

@debug
class SequenceBlock:
  def __init__(self, children):
    self._children = children

  def linearize(self):
    return [segment for child in self._children for segment in child.linearize()]


# ----


@debug
class Segment:
  def __init__(self, index, process_namespace, state):
    self.index = index
    self.process_namespace = process_namespace
    self.state = state

@debug
class SegmentBlock:
  def __init__(self, segment):
    self._segment = segment

  def linearize(self):
    return [self._segment]


class FiberParser:
  def __init__(self, text, *, host, parsers):
    self._parsers = [Parser(self) for Parser in [SequenceParser, DoParser, AcmeParser, ScoreParser]]

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


    self._segments = list()

    data_actions = output['_']['steps']
    entry_block = self.parse_block(data_actions)

    print()

    print("<= ANALYSIS =>")
    print("Errors >", self.analysis.errors)
    print()

    if entry_block is not Ellipsis:
      print("<= ENTRY =>")
      print(entry_block)
      print()

      print("<= LINEARIZATION =>")
      pprint(entry_block.linearize())
      print()

    print("<= SEGMENTS =>")
    pprint(self._segments)

  @property
  def segment_dict(self):
    schema_dict = lang.CompositeDict()

    for parser in self._parsers:
      schema_dict.add(parser.segment_attributes, namespace=parser.namespace)

    return schema_dict


  def parse_block(self, data_block, parent_state = None, parent_transforms = None):
    dict_analysis, block_attrs = self.segment_dict.analyze(data_block)
    self.analysis += dict_analysis

    block_state = dict()
    block_transforms = parent_transforms or list()

    for parser in self._parsers:
      unit_data = parser.parse_block(block_attrs, parent_state[parser.namespace] if parent_state else None)

      if unit_data is Ellipsis:
        return Ellipsis

      block_state[parser.namespace] = unit_data.state
      block_transforms += unit_data.transforms

    for transform_index, transform in enumerate(block_transforms):
      return transform.execute(block_state, block_transforms[(transform_index + 1):])

    process_namespaces = {namespace for namespace, state in block_state.items() if state and state.process}

    if (not process_namespaces) or (len(process_namespaces) > 1):
      self.analysis.errors.append(MissingProcessError(data_block))
      return Ellipsis

    segment = Segment(
      index=len(self._segments),
      process_namespace=process_namespaces.pop(),
      state=block_state
    )

    self._segments.append(segment)
    return SegmentBlock(segment)


if __name__ == "__main__":
  p = FiberParser("""
# shorthands:
#   foo:
#     activate: 56

steps:
  score: 4
  actions:
    - activate: 4
    - activate: 3
      score: ${{ 16.3!!!! }}
    - do:
        activate: 5
        score: 1
      score: 2
""", host=None, parsers=None)

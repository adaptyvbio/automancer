from collections import namedtuple

from . import langservice as lang
from .expr import PythonExprEvaluator
from .staticeval import EvaluationContext
from .. import reader
from ..draft import DraftDiagnostic
from ..units.base import BaseParser
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

class BlockUnitState:
  process = False

  def __or__(self, other):
    return other


@debug
class AcmeState(BlockUnitState):
  process = True

  def __init__(self, value):
    self._value = value

class AcmeParser(BaseParser):
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

  def parse_block(self, block_attrs, context):
    attrs = block_attrs[self.namespace]

    if 'activate' in attrs:
      value = attrs['activate'].value
      return BlockData(state=AcmeState(value))
    else:
      return BlockData()

  def transform_block(self, transform, block_state, block_transforms):
    return None


# ----


class ScoreParser(BaseParser):
  namespace = "score"
  root_attributes = dict()
  segment_attributes = {
    'score': lang.Attribute(optional=True, type=lang.LiteralOrExprType(lang.PrimitiveType(float)))
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def enter_protocol(self, data_protocol):
    pass

  def parse_block(self, block_attrs, context):
    attrs = block_attrs[self.namespace]

    if ('score' in attrs) and ((score_raw := attrs['score']) is not Ellipsis):
      if isinstance(score_raw, PythonExprEvaluator):
        analysis, score = score_raw.evaluate(context)
        # TODO: Do something with 'analysis'

        if score is Ellipsis:
          print(analysis.errors[0].area.format())
          return Ellipsis

        score = score.value
      else:
        score = score_raw.value

      return BlockData(state=ScoreState(score))
    else:
      return BlockData(state=ScoreState(0.0))

@debug
class ScoreState(BlockUnitState):
  def __init__(self, points):
    self.points = points

  def __or__(self, other: 'ScoreState'):
    return ScoreState(self.points + other.points)

# ----


class ConditionParser(BaseParser):
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
class ConditionBlock(BaseParser):
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


class DoParser(BaseParser):
  namespace = "do"

  root_attributes = dict()
  segment_attributes = {
    'do': lang.Attribute(optional=True, type=lang.AnyType())
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def enter_protocol(self, data_protocol):
    pass

  def parse_block(self, block_attrs, context):
    attrs = block_attrs[self.namespace]

    if 'do' in attrs:
      return BlockData(transforms=[DoTransform(attrs['do'], parser=self)])
    else:
      return BlockData()

@debug
class DoTransform: # do after
  def __init__(self, data_do, parser):
    self._data_do = data_do
    self._parser = parser

  def execute(self, state, parent_state, transforms):
    block_state, block_transforms = self._parser._fiber.parse_block(self._data_do)
    return self._parser._fiber.execute(block_state, parent_state | state, transforms + block_transforms)
    # return all_transforms[0].execute(substate, parent_state | state, all_transforms[1:])


# ----


class ShorthandsParser(BaseParser):
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
      self._shorthands[shorthand_name] = data_shorthand

      # self._shorthands[shorthand_name] = self._fiber.parse_block(data_shorthand, None, None)
      # dict_analysis, block_attrs = self.parse_block_attrs(data_block)

    # from pprint import pprint
    # pprint(self._shorthands)

  def parse_block(self, block_attrs, parent_state, context):
    attrs = block_attrs[self.namespace]
    state = None

    if attrs:
      return BlockData(transforms=[
        ShorthandTransform(attrs, parser=self)
      ])
    else:
      return BlockData()

  # def parse_block(self, block_attrs, block_state):
  #   state = block_state[self.namespace]

  #   if state:
  #     # new_state = { namespace: (block_state[namespace] or dict()) | (state[namespace] or dict()) for namespace in set(block_state.keys()) | set(state.keys()) }
  #     return self._fiber.parse_part(state)

  #   return None


@debug
class ShorthandTransform:
  def __init__(self, attrs, parser):
    self._attrs = attrs
    self._parser = parser

  def execute(self, block_state, block_transforms):
    state = block_state
    transforms = list()

    for shorthand_name, shorthand_value in self._attrs.items():
      data_shorthand = self._parser._shorthands[shorthand_name]
      state, shorthand_transforms = self._parser._fiber.parse_block_partial(data_shorthand, state)
      transforms += shorthand_transforms

    transforms += block_transforms

    return self._parser._fiber.parse_block({}, state, transforms)


# ----


class SequenceParser(BaseParser):
  namespace = "sequence"
  root_attributes = dict()
  segment_attributes = {
    'actions': lang.Attribute(optional=True, type=lang.AnyType())
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def enter_protocol(self, data_protocol):
    pass

  def parse_block(self, block_attrs, context):
    attrs = block_attrs[self.namespace]

    if 'actions' in attrs:
      return BlockData(transforms=[
        SequenceTransform(attrs['actions'], parser=self)
      ])
    else:
      return BlockData()


@debug
class SequenceTransform:
  def __init__(self, data_actions, parser):
    self._data_actions = data_actions
    self._parser = parser

  def execute(self, state, parent_state, transforms):
    children = list()

    for data_action in self._data_actions:
      block_state, block_transforms = self._parser._fiber.parse_block(data_action)
      block = self._parser._fiber.execute(block_state, parent_state | state, transforms + block_transforms)
      children.append(block)

    return SequenceBlock(children)

@debug
class SequenceBlock:
  def __init__(self, children):
    self._children = children

  def __getitem__(self, key):
    return self._children[key]

  def evaluate(self, context):
    for child in self._children:
      child.evaluate(context)

  def linearize(self):
    return [([index, *path], subblock) for index, block in enumerate(self._children) for path, subblock in block.linearize()]


# ----


@debug
class Segment:
  def __init__(self, process_namespace, state):
    self.process_namespace = process_namespace
    self.state = state

@debug
class SegmentTransform:
  def __init__(self, namespace):
    self._namespace = namespace

  def execute(self, state, parent_state, transforms):
    return SegmentBlock(Segment(
      process_namespace=self._namespace,
      state=(parent_state | state)
    ))

@debug
class SegmentBlock:
  def __init__(self, segment):
    self._segment = segment

  def __getitem__(self, key):
    assert key is None
    return self._segment

  # def evaluate(self, context):
  #   for namespace, parser in context.fiber.parsers.items():
  #     parser.evaluate_segment(self._segment.state[namespace], context)

  def linearize(self):
    return [([None], self._segment)]



class BlockState(dict):
  def __or__(self, other):
    return other.__ror__(self)

  def __ror__(self, other):
    if other is None:
      return self
    else:
      result = dict()

      for key, value in self.items():
        other_value = other[key]

        if value is None:
          result[key] = other_value
        elif other_value is None:
          result[key] = value
        else:
          result[key] = other_value | value

      return BlockState(result)


class FiberParser:
  def __init__(self, text, *, host, parsers):
    self._parsers: list[BaseParser] = [Parser(self) for Parser in [SequenceParser, DoParser, AcmeParser, ScoreParser]]
    # self._parsers: list[BaseParser] = [Parser(self) for Parser in [SequenceParser, DoParser, ShorthandsParser, AcmeParser, ScoreParser]]
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

    self._segments = list()

    for parser in self._parsers:
      parser.enter_protocol(output[parser.namespace])

    data_actions = output['_']['steps']
    state, transforms = self.parse_block(data_actions)
    entry_block = self.execute(state, None, transforms)

    print()

    print("<= ANALYSIS =>")
    print("Errors >", self.analysis.errors)
    print()

    if entry_block is not Ellipsis:
      print("<= ENTRY =>")
      print(entry_block)
      print()

      # print("<= LINEARIZATION =>")
      # pprint(entry_block.linearize())
      # print()

    print("<= SEGMENTS =>")
    pprint(self._segments)

  @property
  def segment_dict(self):
    schema_dict = lang.CompositeDict()

    for parser in self._parsers:
      schema_dict.add(parser.segment_attributes, namespace=parser.namespace)

    return schema_dict


  def parse_block(self, data_block):
    dict_analysis, block_attrs = self.segment_dict.analyze(data_block)
    self.analysis += dict_analysis

    # class State:
    #   def __init__(self):
    #     self._data = dict()

    #   def __getitem__(self, index):
    #     return self._data[index]

    #   def __setitem__(self, index, value):
    #     self._data[index] = value


    state = BlockState()
    transforms = list()

    from random import random
    context = EvaluationContext(
      variables=dict(
        random=(lambda start, end: random() * (end.value - start.value) + start.value)
      )
    )

    for parser in self._parsers:
      unit_data = parser.parse_block(block_attrs, context)

      if unit_data is Ellipsis:
        return Ellipsis

      state[parser.namespace] = unit_data.state
      transforms += unit_data.transforms

    return state, transforms

  def execute(self, state, parent_state, transforms):
    # if (not transforms) and (parent_state | state)['acme']:
    #   transforms = [SegmentTransform('acme')]
    # else:
    #   pass
      # print(state, parent_state, parent_state | state)

    if not transforms:
      for namespace, parser_state in (parent_state | state).items():
        if parser_state and parser_state.process:
          transforms = [SegmentTransform(namespace)]
          break
      else:
        raise ValueError()

    return transforms[0].execute(state, parent_state, transforms[1:])

    # process_namespaces = {namespace for namespace, state in block_state.items() if state and state.process}

    # if (not process_namespaces) or (len(process_namespaces) > 1):
    #   self.analysis.errors.append(MissingProcessError(data_block))
    #   return Ellipsis

    # segment = Segment(
    #   index=len(self._segments),
    #   process_namespace=process_namespaces.pop(),
    #   state=block_state
    # )

    # self._segments.append(segment)
    # return SegmentBlock(segment)


if __name__ == "__main__":
  p = FiberParser("""
shorthands:
  foo:
    activate: 42
    # actions:
    #   - score: 200
    #   - score: 300
    # actions:
    #   - activate: 56
    #   - activate: 57

steps:
  # foo:
  activate: 50
  score: 1
  do:
    score: 7
    # activate: 100

  # actions:
  #   - score: 4
  #   - activate: 3

  # score: 4
  # foo:
  # actions:
  #   - activate: 4
  #   - activate: 3
  #     score: ${{ random(100, 200) }}
  #   - do:
  #       activate: 5
  #       score: 1
  #     score: 2
""", host=None, parsers=None)

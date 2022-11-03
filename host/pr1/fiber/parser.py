from collections import namedtuple
from types import EllipsisType
from typing import Any, Optional, Sequence

from . import langservice as lang
from .expr import PythonExprEvaluator
from .staticeval import EvaluationContext
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


class BlockUnitState:
  def __or__(self, other):
    return other

@debug
class BlockData:
  def __init__(self, *, state: Optional[BlockUnitState] = None, transforms: list['BaseTransform'] = list()):
    self.state = state
    self.transforms = transforms

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


class BaseBlock:
  pass

class BaseParser:
  namespace: str
  priority = 0
  root_attributes: dict[str, lang.Attribute]
  segment_attributes: dict[str, lang.Attribute]

  def __init__(self, fiber: 'FiberParser'):
    pass

  def enter_protocol(self, data_protocol: Any):
    pass

  def parse_block(self, block_attrs: Any, context: Any) -> tuple[lang.Analysis, BlockData | EllipsisType]:
    return lang.Analysis(), BlockData()

class BaseTransform:
  def execute(self, state: BlockState, parent_state: Optional[BlockState], transforms: list['BaseTransform']) -> tuple[lang.Analysis, BaseBlock]:
    raise NotImplementedError()


# ----


@debug
class Segment:
  def __init__(self, process_namespace, state):
    self.process_namespace = process_namespace
    self.state = state

@debug
class SegmentTransform(BaseTransform):
  def __init__(self, namespace):
    self._namespace = namespace

  def execute(self, state, parent_state, transforms):
    return lang.Analysis(), SegmentBlock(Segment(
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

  def get_states(self):
    return {self._segment.state}

  def linearize(self):
    return [([None], self._segment)]

  def export(self):
    return {
      "process_namespace": self._segment.process_namespace,
      "state": {
        namespace: state and state.export() for namespace, state in self._segment.state.items()
      }
    }


# ----


class FiberProtocol:
  def __init__(self, *, name: Optional[str], root):
    self.name = name
    self.root = root

  def export(self):
    return {
      "name": self.name,
      "root": self.root.export()
    }


class FiberParser:
  def __init__(self, text: str, *, Parsers: Sequence[type[BaseParser]], host):
    self._parsers: list[BaseParser] = [Parser(self) for Parser in Parsers]
    self.analysis = lang.Analysis()

    data, reader_errors, reader_warnings = reader.loads(text)

    self.analysis.errors += reader_errors
    self.analysis.warnings += reader_warnings

    schema = lang.CompositeDict({
      'name': lang.Attribute(
        label="Protocol name",
        description="The protocol's name.",
        optional=True,
        type=lang.PrimitiveType(str)
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

    if entry_block is not Ellipsis:
      self.protocol = FiberProtocol(name=output['_']['name'], root=entry_block)
      pprint(self.protocol.export())

  @property
  def segment_dict(self):
    schema_dict = lang.CompositeDict()

    for parser in self._parsers:
      schema_dict.add(parser.segment_attributes, namespace=parser.namespace)

    return schema_dict


  def parse_block(self, data_block) -> EllipsisType | tuple[BlockState, list[BaseTransform]]:
    dict_analysis, block_attrs = self.segment_dict.analyze(data_block)
    self.analysis += dict_analysis

    if block_attrs is Ellipsis:
      return Ellipsis


    state = BlockState()
    transforms = list()

    from random import random
    context = EvaluationContext(
      variables=dict(
        random=(lambda start, end: random() * (end.value - start.value) + start.value)
      )
    )

    for parser in self._parsers:
      analysis, unit_data = parser.parse_block(block_attrs, context)
      self.analysis += analysis

      if unit_data is Ellipsis:
        return Ellipsis

      state[parser.namespace] = unit_data.state
      transforms += unit_data.transforms

    return state, transforms

  def execute(self, state, parent_state, transforms: list[BaseTransform]) -> Optional[BaseBlock]:
    if not transforms:
      return None

      # for namespace, parser_state in (parent_state | state).items():
      #   if parser_state and parser_state.process:
      #     transforms = [SegmentTransform(namespace)]
      #     break
      # else:
      #   raise ValueError()

    analysis, block = transforms[0].execute(state, parent_state, transforms[1:])
    self.analysis += analysis

    return block

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
  from .parsers.activate import AcmeParser
  from .parsers.condition import ConditionParser
  from .parsers.do import DoParser
  from .parsers.score import ScoreParser
  from .parsers.sequence import SequenceParser
  from .parsers.shorthands import ShorthandsParser


  p = FiberParser("""
shorthands:
  foo:
    score: 16
    activate: 42

    # actions:
    #   - score: 200
    #   - score: 300
    # actions:
    #   - activate: 56
    #   - activate: 57

steps:
  actions:
    - activate: -45
    - activate: 46
  score: 3
  # foo:

  # do_before:
  #   score: 1

  # foo:
  # - score: 6
  # do:
  #   score: 7
  #   # activate: 100

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
""", Parsers=[SequenceParser, DoParser, ShorthandsParser, AcmeParser, ScoreParser], host=None)

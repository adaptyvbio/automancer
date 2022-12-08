from collections import namedtuple
from pint import UnitRegistry
from types import EllipsisType
from typing import Any, AsyncIterator, Optional, Protocol, Sequence

from . import langservice as lang
from .eval import EvalEnv, EvalEnvs, EvalStack
from .expr import PythonExpr, PythonExprEvaluator
from .. import reader
from ..reader import LocationArea
from ..draft import DraftDiagnostic, DraftGenericError
from ..util import schema as sc
from ..util.decorators import debug


@debug
class MissingProcessError(Exception):
  def __init__(self, area: LocationArea):
    self.area = area

  def diagnostic(self):
    return DraftDiagnostic(f"Missing process", ranges=self.area.ranges)


class BlockUnitState:
  def __or__(self, other):
    return other

  def __and__(self, other):
    ...

  def __rand__(self, other):
    ...

  def export(self) -> object:
    ...

class BlockState(dict[str, Optional[BlockUnitState]]):
  def __or__(self, other: 'BlockState'):
    return other.__ror__(self)

  def __ror__(self, other: Optional['BlockState']):
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

  def __and__(self, other: 'BlockState'):
    self_result = dict()
    other_result = dict()

    for namespace, value in self.items():
      other_value = other[namespace]

      if (value is not None) or (other_value is not None):
        self_result[namespace], other_result[namespace] = value & other_value # type: ignore
      else:
        self_result[namespace], other_result[namespace] = None, None

    return BlockState(self_result), BlockState(other_result)

  def export(self):
    return { namespace: state and state.export() for namespace, state in self.items() if state }


@debug
class BlockData:
  def __init__(
    self,
    *,
    state: BlockState,
    transforms: 'Transforms'
  ):
    self.state = state
    self.transforms = transforms

@debug
class BlockUnitData:
  def __init__(
    self,
    *,
    envs: Optional[list[EvalEnv]] = None,
    state: Optional[BlockUnitState] = None,
    transforms: Optional[list['BaseTransform']] = None
  ):
    self.envs = envs or list()
    self.state = state
    self.transforms = transforms or list()

class BlockProgram(Protocol):
  def __init__(self, block: 'BaseBlock', master: Any, parent: 'BlockProgram' | Any):
    ...

  def pause(self):
    ...

  def resume(self):
    ...

  def run(self, child: Any, /, symbol) -> AsyncIterator[Any]:
    ...

class BaseBlock(Protocol):
  def __init__(self):
    self.state: Optional[BlockState]

  def linearize(self, context, parent_state) -> Any:
    ...

  def export(self):
    ...

  Program: type[BlockProgram]

BlockAttrs = dict[str, dict[str, Any | EllipsisType]]

class BaseParser:
  namespace: str
  priority = 0
  root_attributes: dict[str, lang.Attribute]
  segment_attributes: dict[str, lang.Attribute]

  def __init__(self, fiber: 'FiberParser'):
    pass

  def enter_protocol(self, data_protocol: BlockAttrs, /, adoption_envs: EvalEnvs, runtime_envs: EvalEnvs):
    return lang.Analysis()

  def parse_block(self, block_attrs: BlockAttrs, /, adoption_envs: EvalEnvs, adoption_stack: EvalStack, runtime_envs: EvalEnvs) -> tuple[lang.Analysis, BlockUnitData | EllipsisType]:
    return lang.Analysis(), BlockUnitData()

class BaseTransform:
  def execute(self, state: BlockState, transforms: 'Transforms', *, origin_area: LocationArea) -> tuple[lang.Analysis, BaseBlock | EllipsisType]:
    ...

Transforms = list[BaseTransform]


# ----


@debug
class LinearizationContext(dict):
  def __init__(self, d = None, *, parser):
    self.parser = parser

    if d:
      for key, value in d.items():
        self[key] = value

  def __or__(self, other):
    return LinearizationContext({ **self, **other }, parser=self.parser)


@debug
class AnalysisContext:
  def __init__(self, *, ureg: UnitRegistry):
    self.ureg = ureg


class UnresolvedBlockData:
  def evaluate(self, stack: EvalStack) -> tuple[lang.Analysis, BlockData | EllipsisType]:
    ...

@debug
class UnresolvedBlockDataExpr(UnresolvedBlockData):
  def __init__(self, expr: PythonExprEvaluator):
    from .opaque import OpaqueValue # TODO: fix circular import

    self._expr = expr
    self._expr._type = lang.PrimitiveType(OpaqueValue) # TODO: fix this

  def evaluate(self, stack: EvalStack):
    from .opaque import ConsumedValueError

    analysis, value = self._expr.evaluate(stack)

    if value is Ellipsis:
      return analysis, Ellipsis

    try:
      return analysis, value.value.as_block()
    except ConsumedValueError:
      analysis.errors.append(DraftGenericError("Value already consumed", ranges=value.area.ranges))
      return analysis, Ellipsis

@debug
class UnresolvedBlockDataLiteral(UnresolvedBlockData):
  def __init__(self, attrs: Any, /, adoption_envs: EvalEnvs, runtime_envs: EvalEnvs, fiber: 'FiberParser'):
    self._attrs = attrs
    self._fiber = fiber
    self._adoption_envs = adoption_envs
    self._runtime_envs = runtime_envs

  def evaluate(self, stack: EvalStack):
    return lang.Analysis(), self._fiber.parse_block_attrs(self._attrs, adoption_envs=self._adoption_envs, adoption_stack=stack, runtime_envs=self._runtime_envs)


# ----


class FiberProtocol:
  def __init__(self, *, name: Optional[str], root: BaseBlock):
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

    self.host = host
    self.ureg = UnitRegistry(autoconvert_offset_to_baseunit=True)

    self.analysis = lang.Analysis()
    self.analysis_context = AnalysisContext(ureg=self.ureg)

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
        type=lang.AnyType()
      )
    }, foldable=True)

    for parser in self._parsers:
      schema.add(parser.root_attributes, namespace=parser.namespace)

    from pprint import pprint
    # pprint(schema._attributes)
    # print(schema.get_attr("name")._label)

    analysis, output = schema.analyze(data, self.analysis_context)
    self.analysis += analysis

    class GlobalEnv(EvalEnv):
      pass

    class StageEnv(EvalEnv):
      pass

    from random import random

    global_env = GlobalEnv()
    stage_env = StageEnv()

    adoption_stack: EvalStack = {
      global_env: dict(random=random),
      stage_env: None
    }

    runtime_stack: EvalStack = {
      global_env: dict(random=random),
      stage_env: None
    }


    for parser in self._parsers:
      # Order is important here as enter_protocol() will also update self.analysis.
      # TODO: Improve by making enter_protocol() return an Analysis.
      self.analysis = parser.enter_protocol(output[parser.namespace], adoption_envs=[global_env, stage_env], runtime_envs=[global_env]) + self.analysis

    data_actions = output['_']['steps']
    data = self.parse_block(data_actions, adoption_envs=[global_env, stage_env], adoption_stack=adoption_stack, runtime_envs=[global_env, stage_env])

    if not isinstance(data, EllipsisType):
      entry_block = self.execute(data.state, data.transforms, origin_area=data_actions.area)
    else:
      entry_block = Ellipsis

    print()

    print("<= ANALYSIS =>")
    print("Errors >", self.analysis.errors)
    print()

    if not isinstance(entry_block, EllipsisType):
      print("<= ENTRY =>")
      print(entry_block)
      pprint(entry_block.export())
      print()

      # print("<= LINEARIZATION =>")
      # linearization_analysis, linearized = entry_block.linearize(LinearizationContext(runtime_stack, parser=self), None)
      # self.analysis += linearization_analysis
      # pprint(linearized)
      # print()

    if not isinstance(entry_block, EllipsisType):
      self.protocol = FiberProtocol(name=output['_']['name'], root=entry_block)
    else:
      self.protocol = None

  @property
  def segment_dict(self):
    schema_dict = lang.CompositeDict()

    for parser in self._parsers:
      schema_dict.add(parser.segment_attributes, namespace=parser.namespace)

    return schema_dict


  def parse_block(self, data_block: Any, /, adoption_envs: EvalEnvs, adoption_stack: EvalStack, runtime_envs: EvalEnvs, *, allow_expr: bool = False) -> BlockData | EllipsisType:
    if allow_expr:
      eval_analysis, eval_value = self.parse_block_expr(data_block, adoption_envs=adoption_envs, runtime_envs=runtime_envs).evaluate(adoption_stack)
      self.analysis += eval_analysis
      return eval_value

    analysis, attrs = self.segment_dict.analyze(data_block, self.analysis_context)
    self.analysis += analysis

    if isinstance(attrs, EllipsisType):
      return Ellipsis

    return self.parse_block_attrs(attrs, adoption_envs=adoption_envs, adoption_stack=adoption_stack, runtime_envs=runtime_envs)

  def parse_block_attrs(self, attrs: Any, /, adoption_envs: EvalEnvs, adoption_stack: EvalStack, runtime_envs: EvalEnvs, *, allow_expr: bool = False) -> BlockData | EllipsisType:
    runtime_envs = runtime_envs.copy()
    state = BlockState()
    transforms: list[BaseTransform] = list()

    for parser in self._parsers:
      analysis, block_data = parser.parse_block(attrs, adoption_envs=adoption_envs, adoption_stack=adoption_stack, runtime_envs=runtime_envs)
      self.analysis += analysis

      if isinstance(block_data, EllipsisType):
        return Ellipsis

      runtime_envs += block_data.envs
      state[parser.namespace] = block_data.state
      transforms += block_data.transforms

    return BlockData(state=state, transforms=transforms)

  def parse_block_expr(self, data_block: Any, /, adoption_envs: EvalEnvs, runtime_envs: EvalEnvs) -> UnresolvedBlockData | EllipsisType:
    analysis, data_attrs = lang.LiteralOrExprType(lang.AnyType()).analyze(data_block, self.analysis_context)
    self.analysis += analysis

    if isinstance(data_attrs, EllipsisType):
      return Ellipsis

    if isinstance(data_attrs, PythonExprEvaluator):
      data_attrs.envs = adoption_envs
      return UnresolvedBlockDataExpr(data_attrs)

    # if isinstance(attrs, PythonExprEvaluator):
    #   attrs.envs = adoption_envs
    #   eval_analysis, eval_value = attrs.evaluate(adoption_stack)
    #   self.analysis += eval_analysis

    #   if isinstance(eval_value, EllipsisType):
    #     return Ellipsis

    #   from .opaque import OpaqueValue
    #   check_analysis, _ = lang.PrimitiveType(OpaqueValue).analyze(eval_value, self.analysis_context)
    #   self.analysis += check_analysis

    #   return eval_value.value.as_block()

    # parse_result = self.parse_block(data_block, adoption_envs=adoption_envs, adoption_stack=adoption_stack, runtime_envs=runtime_envs)

    # if isinstance(parse_result, EllipsisType):
    #   return Ellipsis

    analysis, attrs = self.segment_dict.analyze(data_block, self.analysis_context)
    self.analysis += analysis

    if isinstance(attrs, EllipsisType):
      return Ellipsis

    return UnresolvedBlockDataLiteral(attrs, adoption_envs=adoption_envs, runtime_envs=runtime_envs, fiber=self)

  def execute(self, state: Optional[BlockState], transforms: Transforms, *, origin_area: LocationArea) -> BaseBlock | EllipsisType:
    if not transforms:
      self.analysis.errors.append(MissingProcessError(origin_area))
      return Ellipsis

    analysis, block = transforms[0].execute(state, transforms[1:], origin_area=origin_area)
    self.analysis += analysis

    return block


if __name__ == "__main__":
  from .parsers.activate import AcmeParser
  from .parsers.condition import ConditionParser
  from .parsers.do import DoParser
  from .parsers.repeat import RepeatParser
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
""", Parsers=[SequenceParser, RepeatParser, DoParser, ShorthandsParser, AcmeParser, ScoreParser], host=None)

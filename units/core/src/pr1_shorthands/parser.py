from asyncio import Event
from dataclasses import dataclass
from types import EllipsisType
from typing import Any, Callable, Optional, TypedDict, cast

from pr1.error import Error, ErrorDocumentReference, ErrorFileReference, Trace
from pr1.fiber.eval import EvalContext, EvalEnv, EvalEnvValue, EvalStack
from pr1.fiber.expr import Evaluable, ValueAsPythonExpr
from pr1.fiber.langservice import (Analysis, AnalysisRelation, AnalysisRename,
                                   AnyType, Attribute, KVDictType,
                                   PotentialExprType, PrimitiveType, StrType)
from pr1.fiber.master2 import ProgramOwner
from pr1.fiber.parser import (AnalysisContext, Attrs, BaseBlock,
                              BaseDefaultTransform, BaseLeadTransformer,
                              BaseParser, BasePassiveTransformer,
                              BaseProgramPoint, BlockData, BlockProgram,
                              BlockState, BlockUnitData,
                              BlockUnitPreparationData, FiberParser, Layer,
                              LeadTransformerPreparationResult,
                              PassiveTransformerPreparationResult,
                              ProtocolUnitData, TransformerAdoptionResult,
                              Transforms)
from pr1.fiber.process import ProgramExecEvent
from pr1.fiber.segment import SegmentTransform
from pr1.master.analysis import MasterAnalysis
from pr1.reader import (LocatedString, LocatedValue, LocationArea, LocationRange,
                        ReliableLocatedDict)
from pr1.util.decorators import debug

from . import namespace


class CircularReferenceError(Error):
  def __init__(self, target: LocatedValue):
    super().__init__("Invalid circular reference", references=[ErrorDocumentReference.from_value(target)])


@dataclass(kw_only=True)
class ShorthandStaticItem:
  create_layer: Callable[[], tuple[Analysis, Layer | EllipsisType]]
  definition_range: LocationRange
  deprecated: bool
  description: Optional[str]
  env: EvalEnv
  layer: Optional[Layer | EllipsisType] = None
  preparing: bool = False
  priority: int = 0
  ref_ranges: list[LocationRange]

@dataclass(kw_only=True)
class ShorthandDynamicItem:
  argument: Evaluable[LocatedValue]
  data: BlockData
  name: str


class Attributes(TypedDict, total=False):
  shorthands: ReliableLocatedDict[LocatedString, Attrs]

class LeadTransformer(BaseLeadTransformer):
  def __init__(self, parser: 'Parser'):
    self.parser = parser

    self.attributes = {
      # shorthand_name: Attribute(
      #   deprecated=shorthand.deprecated,
      #   description=shorthand.description,
      #   type=AnyType()
      # ) for shorthand_name, shorthand in self.parser.shorthands.items() if not isinstance(shorthand.layer, EllipsisType) and shorthand.layer.lead_transform
    }

  def prepare(self, data: Attrs, /, adoption_envs, runtime_envs):
    analysis = Analysis()
    calls = list[LeadTransformerPreparationResult[tuple[ShorthandStaticItem, LocationArea, Any]]]()

    context = AnalysisContext(envs_list=[adoption_envs, runtime_envs])

    for shorthand_name, arg in data.items():
      shorthand = self.parser.shorthands[shorthand_name]
      assert shorthand.layer

      if (not isinstance(shorthand.layer, EllipsisType)) and shorthand.layer.lead_transform:
        arg_result = analysis.add(PotentialExprType(AnyType()).analyze(arg, context))

        if not isinstance(arg_result, EllipsisType):
          call_area = cast(LocatedString, shorthand_name).area
          calls.append(LeadTransformerPreparationResult((shorthand, call_area, arg_result), origin_area=call_area))

    return analysis, calls

  def adopt(self, data: tuple[ShorthandStaticItem, LocationArea, Any], /, adoption_stack, trace):
    analysis = Analysis()
    shorthand, call_area, arg = data

    assert shorthand.layer
    assert not isinstance(shorthand.layer, EllipsisType)

    arg_result = analysis.add(arg.eval(EvalContext(adoption_stack), final=True))

    if isinstance(arg_result, EllipsisType):
      return analysis, Ellipsis

    block = analysis.add(shorthand.layer.adopt_lead(adoption_stack | {
      shorthand.env: {
        'arg': arg_result.value().value
      }
    }, [*trace, ErrorDocumentReference.from_area(call_area)]))

    if isinstance(block, EllipsisType):
      return analysis, Ellipsis

    return analysis, block

class PassiveTransformer(BasePassiveTransformer):
  priority = 300

  def __init__(self, parser: 'Parser'):
    self.parser = parser

  def prepare(self, data: Attrs, /, adoption_envs, runtime_envs):
    analysis = Analysis()
    calls = list[tuple[ShorthandStaticItem, LocationArea, Evaluable]]()

    context = AnalysisContext(envs_list=[adoption_envs, runtime_envs])

    for shorthand_name, arg in data.items():
      shorthand = self.parser.shorthands[shorthand_name]
      assert shorthand.layer

      if (not isinstance(shorthand.layer, EllipsisType)) and (not shorthand.layer.lead_transform):
        arg_result = analysis.add(PotentialExprType(AnyType()).analyze(arg, context))

        if not isinstance(arg_result, EllipsisType):
          calls.append((shorthand, cast(LocatedString, shorthand_name).area, arg_result))

    calls = sorted(calls, key=(lambda call: -call[0].priority))

    return analysis, (PassiveTransformerPreparationResult(calls) if calls else None)

  def adopt(self, data: list[tuple[ShorthandStaticItem, LocationArea, Evaluable[LocatedValue[Any]]]], /, adoption_stack, trace):
    analysis = Analysis()
    calls = list[tuple[ShorthandStaticItem, Any]]()

    for shorthand, call_area, arg in data:
      assert isinstance(shorthand.layer, Layer)

      arg_result = analysis.add(arg.eval(EvalContext(adoption_stack), final=True))

      if isinstance(arg_result, EllipsisType):
        continue

      adopted_transforms, _ = analysis.add(shorthand.layer.adopt(adoption_stack | {
        shorthand.env: {
          'arg': arg_result.value().value
        }
      }, [*trace, ErrorDocumentReference.from_area(call_area)]))

      calls.append((shorthand, adopted_transforms))

    return analysis, TransformerAdoptionResult(calls)

  def execute(self, data: list[tuple[ShorthandStaticItem, Any]], /, block):
    analysis = Analysis()
    current_block = block

    for shorthand, adopted_transforms in data[::-1]:
      assert isinstance(shorthand.layer, Layer)
      current_block = analysis.add(shorthand.layer.execute(adopted_transforms, current_block))

    return analysis, current_block


class Parser(BaseParser):
  namespace = namespace

  root_attributes = {
    'shorthands': Attribute(
      description="Defines shorthands, parts of steps that can be reused.",
      type=KVDictType(StrType(), PrimitiveType(dict))
    )
  }

  def __init__(self, fiber: FiberParser):
    self.fiber = fiber
    self.shorthands = dict[str, ShorthandStaticItem]()
    self.transformers = [
      LeadTransformer(self),
      PassiveTransformer(self)
    ]

  @property
  def layer_attributes(self):
    return {
      shorthand_name: Attribute(
        deprecated=shorthand.deprecated,
        description=shorthand.description,
        type=AnyType()
      ) for shorthand_name, shorthand in self.shorthands.items()
    }

  def preload(self, raw_attrs: Attrs, /):
    analysis = Analysis()

    for shorthand_name in raw_attrs.keys():
      shorthand = self.shorthands[shorthand_name]

      if not shorthand.layer:
        if shorthand.preparing:
          shorthand.layer = Ellipsis
          analysis.errors.append(CircularReferenceError(cast(LocatedString, shorthand_name)))
          continue

        shorthand.preparing = True
        shorthand.layer = analysis.add(shorthand.create_layer())

        if not isinstance(shorthand.layer, EllipsisType):
          assert (extra_info := shorthand.layer.extra_info) is not None

          if not isinstance(extra_info, EllipsisType) and ('_priority' in extra_info):
            shorthand.priority = extra_info['_priority'].value

    return analysis, None

  def enter_protocol(self, data: Attributes, /, adoption_envs, runtime_envs):
    analysis = Analysis()

    if (attr := data.get('shorthands')):
      for name, data_shorthand in attr.items():
        env = EvalEnv({
          'arg': EvalEnvValue()
        }, readonly=True)

        create_layer = lambda data_shorthand = data_shorthand, env = env: self.fiber.parse_layer(data_shorthand, adoption_envs=[*adoption_envs, env], runtime_envs=[*runtime_envs, env], extra_attributes={
          '_priority': Attribute(
            PrimitiveType(int),
            description="Sets the priority of the shorthand. Shorthands with a higher priority are executed before those with a lower priority when running a protocol."
          )
        }, mode='any')

        # layer_attrs, special_attrs = split_sequence(list(data_shorthand.items()), lambda item: item[0].startswith("_"))

        # result = analysis.add(SimpleDictType({
        #   '_priority': Attribute(
        #     PrimitiveType(int),
        #     description="Sets the priority of the shorthand. Shorthands with a higher priority are executed before those with a lower priority when running a protocol."
        #   )
        # }).analyze(dict(special_attrs), AnalysisContext()))

        if isinstance(attr, ReliableLocatedDict):
          comments = attr.comments[name]
          regular_comments = [comment for comment in comments if not comment.startswith("@")]

          deprecated = any(comment == "@deprecated" for comment in comments)
          description = regular_comments[0].value if regular_comments else None
        else:
          deprecated = False
          description = None

        self.shorthands[name] = ShorthandStaticItem(
          create_layer=create_layer,
          definition_range=name.area.single_range(),
          deprecated=deprecated,
          description=description,
          env=env,
          ref_ranges=list()
        )

        # print(self.shorthands)

        # self.segment_attributes[name] = lang.Attribute(
        #   deprecated=deprecated,
        #   description=description,
        #   type=lang.AnyType()
        # )

    return analysis, ProtocolUnitData()

  def leave_protocol(self):
    analysis = Analysis()

    for shorthand in self.shorthands.values():
      if not shorthand.layer:
        # TODO: Add unused highlight
        _ = analysis.add(shorthand.create_layer())

      analysis.renames.append(AnalysisRename([
        shorthand.definition_range,
        *shorthand.ref_ranges
      ]))

      analysis.relations.append(AnalysisRelation(
        shorthand.definition_range,
        shorthand.ref_ranges
      ))

    return analysis



@dataclass
class ShorthandProgramPoint(BaseProgramPoint):
  child: BaseProgramPoint

@dataclass
class ShorthandProgramLocation:
  pass

  def export(self):
    return dict()

class ShorthandProgram(BlockProgram):
  def __init__(self, block: 'ShorthandBlock', handle):
    self._block = block
    self._handle = handle

    self._bypass_event = Event()
    self._child_program: Optional[ProgramOwner] = None

  def halt(self):
    if self._child_program:
      self._child_program.halt()
    else:
      self._bypass_event.set()

  async def run(self, stack):
    analysis, result = self._block._argument.eval(EvalContext(stack), final=True)

    self._handle.send(ProgramExecEvent(analysis=MasterAnalysis.cast(analysis), location=ShorthandProgramLocation()))

    if isinstance(result, EllipsisType):
      await self._bypass_event.wait()
    else:
      runtime_stack: EvalStack = {
        **stack,
        self._block._env: {
          'arg': result.value
        }
      }

      self._child_program = self._handle.create_child(self._block._child)
      await self._child_program.run(runtime_stack)

@debug
class ShorthandBlock(BaseBlock):
  Point = ShorthandProgramPoint
  Program = ShorthandProgram

  def __init__(self, child: BaseBlock, /, argument: Evaluable[LocatedValue], env: EvalEnv):
    self._argument = argument
    self._child = child
    self._env = env

  def export(self):
    return {
      "namespace": namespace,
      "child": self._child.export()
    }

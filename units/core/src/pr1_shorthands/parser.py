from asyncio import Event
from dataclasses import dataclass
from types import EllipsisType
from typing import Any, Callable, Optional, TypedDict, cast

from pr1.error import ErrorDocumentReference
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
from pr1.reader import (LocatedString, LocatedValue, LocationRange,
                        ReliableLocatedDict)
from pr1.util.decorators import debug
from pr1.util.misc import split_sequence

from . import namespace


@dataclass(kw_only=True)
class ShorthandStaticItem:
  create_layer: Callable[[], tuple[Analysis, Layer | EllipsisType]]
  definition_range: LocationRange
  deprecated: bool
  description: Optional[str]
  env: EvalEnv
  layer: Optional[Layer | EllipsisType] = None
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
    calls = list[LeadTransformerPreparationResult[tuple[ShorthandStaticItem, Any]]]()

    context = AnalysisContext(envs_list=[adoption_envs, runtime_envs])

    for shorthand_name, arg in data.items():
      shorthand = self.parser.shorthands[shorthand_name]
      assert shorthand.layer

      if (not isinstance(shorthand.layer, EllipsisType)) and shorthand.layer.lead_transform:
        arg_result = analysis.add(PotentialExprType(AnyType()).analyze(arg, context))

        if not isinstance(arg_result, EllipsisType):
          calls.append(LeadTransformerPreparationResult((shorthand, arg_result), origin_area=shorthand_name.area))

    return analysis, calls

  def adopt(self, data: tuple[ShorthandStaticItem, Any], /, adoption_stack):
    analysis = Analysis()
    shorthand, arg = data

    assert shorthand.layer
    assert not isinstance(shorthand.layer, EllipsisType)

    arg_result = analysis.add(arg.eval(EvalContext(adoption_stack), final=True))

    if isinstance(arg_result, EllipsisType):
      return analysis, Ellipsis

    block = analysis.add(shorthand.layer.adopt_lead(adoption_stack | {
      shorthand.env: {
        'arg': arg_result.value().value
      }
    }))

    if isinstance(block, EllipsisType):
      return analysis, Ellipsis

    return analysis, block

class PassiveTransformer(BasePassiveTransformer):
  priority = 300

  def __init__(self, parser: 'Parser'):
    self.parser = parser

  def prepare(self, data: Attrs, /, adoption_envs, runtime_envs):
    analysis = Analysis()
    calls = list[tuple[ShorthandStaticItem, Any]]()

    context = AnalysisContext(envs_list=[adoption_envs, runtime_envs])

    for shorthand_name, arg in data.items():
      shorthand = self.parser.shorthands[shorthand_name]
      assert shorthand.layer

      if (not isinstance(shorthand.layer, EllipsisType)) and (not shorthand.layer.lead_transform):
        arg_result = analysis.add(PotentialExprType(AnyType()).analyze(arg, context))

        if not isinstance(arg_result, EllipsisType):
          calls.append((shorthand, arg_result))

    calls = sorted(calls, key=(lambda call: -call[0].priority))

    return analysis, (PassiveTransformerPreparationResult(calls) if calls else None)

  def adopt(self, data: list[tuple[ShorthandStaticItem, Evaluable[LocatedValue[Any]]]], /, adoption_stack):
    analysis = Analysis()
    calls = list[tuple[ShorthandStaticItem, Any]]()

    for shorthand, arg in data:
      assert isinstance(shorthand.layer, Layer)

      arg_result = analysis.add(arg.eval(EvalContext(adoption_stack), final=True))

      if isinstance(arg_result, EllipsisType):
        continue

      adopted_transforms, _ = analysis.add(shorthand.layer.adopt(adoption_stack | {
        shorthand.env: {
          'arg': arg_result.value().value
        }
      }))

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

    for shorthand_item in self.shorthands.values():
      analysis.renames.append(AnalysisRename([
        shorthand_item.definition_range,
        *shorthand_item.ref_ranges
      ]))

      analysis.relations.append(AnalysisRelation(
        shorthand_item.definition_range,
        shorthand_item.ref_ranges
      ))

    return analysis

  def prepare_block(self, attrs, /, adoption_envs, runtime_envs):
    analysis = lang.Analysis()
    context = AnalysisContext(envs_list=[adoption_envs, runtime_envs])
    prep = dict[str, Evaluable]()

    for shorthand_name, shorthand_value in attrs.items():
      assert isinstance(shorthand_name, LocatedString)

      shorthand_item = self.shorthands[shorthand_name]
      shorthand_item.ref_ranges.append(shorthand_name.area.single_range())

      if isinstance(shorthand_item.layer, EllipsisType):
        continue

      result = analysis.add(lang.PotentialExprType(lang.AnyType()).analyze(shorthand_value, context))

      if isinstance(result, EllipsisType):
        continue

      prep[shorthand_name] = result

    return analysis, BlockUnitPreparationData(prep)

  def parse_block(self, attrs: dict[LocatedString, Evaluable], /, adoption_stack, trace):
    analysis = lang.Analysis()
    failure = False
    shorthands_items = list[ShorthandDynamicItem]()

    for shorthand_name, shorthand_value in attrs.items():
      shorthand_item = self.shorthands[shorthand_name]
      shorthand_trace = trace + [ErrorDocumentReference.from_value(shorthand_name)]

      if isinstance(shorthand_value, EllipsisType):
        failure = True
        continue

      value = analysis.add(shorthand_value.eval(EvalContext(adoption_stack), final=True), shorthand_trace)

      if isinstance(value, EllipsisType):
        failure = True
        continue

      shorthand_adoption_stack: EvalStack = {
        **adoption_stack,
        shorthand_item.env: {
          'arg': value.value().value if isinstance(value, ValueAsPythonExpr) else None
        }
      }

      assert not isinstance(shorthand_item.layer, EllipsisType)
      shorthand_result = analysis.add(self.fiber.parse_block(shorthand_item.layer, shorthand_adoption_stack), shorthand_trace)

      if isinstance(shorthand_result, EllipsisType):
        failure = True
        continue

      shorthands_items.append(
        ShorthandDynamicItem(
          argument=value,
          data=shorthand_result,
          name=shorthand_name
        )
      )

    return analysis, BlockUnitData(transforms=([ShorthandTransform(shorthands_items, parser=self)] if shorthands_items else list())) if not failure else Ellipsis


@debug
class ShorthandTransform(BaseDefaultTransform):
  def __init__(self, items: list[ShorthandDynamicItem], /, parser: Parser):
    self._items = items
    self._parser = parser

  def execute(self, state, transforms, *, origin_area):
    analysis = lang.Analysis()
    block_state: BlockState = cast(BlockState, None)

    transforms_final = Transforms()
    transforms_incl_segment = Transforms()
    has_segment_transform = lambda transforms: any(isinstance(transform, SegmentTransform) for transform in transforms)

    if has_segment_transform:
      transforms_incl_segment = transforms
    else:
      transforms_final += transforms

    for item in self._items:
      if has_segment_transform(item.data.transforms) and (not transforms_incl_segment):
        transforms_incl_segment = item.data.transforms
      else:
        transforms_final += item.data.transforms

      if block_state is not None:
        block_state = item.data.state | block_state
      else:
        block_state = item.data.state

    block = analysis.add(self._parser.fiber.execute(block_state, (transforms_final + transforms_incl_segment), origin_area=origin_area))

    if isinstance(block, EllipsisType):
      return analysis, Ellipsis

    for item in self._items:
      shorthand = self._parser.shorthands[item.name]
      block = ShorthandBlock(block, argument=item.argument, env=shorthand.env)

    return analysis, block


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

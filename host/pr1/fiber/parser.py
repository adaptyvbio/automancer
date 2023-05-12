from abc import ABC, abstractmethod
from dataclasses import KW_ONLY, dataclass, field
from pathlib import Path, PurePath
from types import EllipsisType
from typing import (TYPE_CHECKING, Any, ClassVar, Generic, Literal, Optional,
                    Protocol, Sequence, TypeVar)

from .. import reader
from ..draft import Draft
from ..error import Error, ErrorDocumentReference, Trace
from ..reader import LocatedString, LocatedValue, LocationArea
from ..ureg import ureg
from ..util.asyncio import run_anonymous
from ..util.decorators import debug
from ..util.misc import Exportable, HierarchyNode
from . import langservice as lang
from .eval import EvalContext, EvalEnv, EvalEnvs, EvalEnvValue, EvalStack

if TYPE_CHECKING:
  from ..host import Host
  from ..units.base import BaseRunner
  from .master2 import ProgramHandle


class DuplicateLeadTransformInLayerError(Error):
  def __init__(self, targets: list[LocationArea]):
    super().__init__(
      "Duplicate lead transform in layer",
      references=[ErrorDocumentReference.from_area(target) for target in targets]
    )

class LeadTransformInPassiveLayerError(Error):
  def __init__(self, target: LocatedValue):
    super().__init__(
      "Lead transform in passive layer",
      references=[ErrorDocumentReference.from_value(target)]
    )

class MissingLeadTransformInLayerError(Error):
  def __init__(self, target: LocatedValue):
    super().__init__(
      "Missing lead transform in layer",
      references=[ErrorDocumentReference.from_value(target)]
    )


class BlockUnitState(Exportable):
  def __or__(self, other):
    return other

  def __and__(self, other):
    return self, other

  # def __rand__(self, other):
  #   ...

  def export(self) -> object:
    ...

class BlockState(dict[str, Optional[BlockUnitState]]):
  def __or__(self, other: 'BlockState'):
    return other.__ror__(self)

  def __ror__(self, other: Optional['BlockState']):
    if other is None:
      return self
    else:
      result = dict[str, Optional[BlockUnitState]]()

      for key, value in self.items():
        other_value = other.get(key)

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


class ProtocolUnitDetails:
  def create_adoption_stack(self):
    return EvalStack()

  def create_runtime_stack(self, runner: 'BaseRunner'):
    return EvalStack()

@dataclass
class ProtocolUnitData:
  details: Optional[ProtocolUnitDetails] = None
  _: KW_ONLY
  adoption_envs: EvalEnvs = field(default_factory=EvalEnvs)
  runtime_envs: EvalEnvs = field(default_factory=EvalEnvs)

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

@dataclass
class BlockUnitData:
  state: Optional[BlockUnitState] = None
  _: KW_ONLY
  envs: EvalEnvs = field(default_factory=EvalEnvs)
  transforms: 'Transforms' = field(default_factory=(lambda: Transforms()))

@dataclass
class BlockUnitPreparationData:
  prep: Optional[Any] = None
  _: KW_ONLY
  envs: EvalEnvs = field(default_factory=EvalEnvs)

BlockPreparationData = dict[str, BlockUnitPreparationData]
ProtocolDetails = dict[str, ProtocolUnitDetails]

class BaseProgram(ABC):
  def __init__(self, block: 'BaseBlock', handle: 'ProgramHandle'):
    self.__block = block
    self.__handle = handle

  @abstractmethod
  def halt(self):
    ...

  def jump(self, point, /) -> bool:
    return False

  def receive(self, message: Any, /) -> None:
    match message["type"]:
      case "halt":
        self.halt()
      case "jump":
        print("Jump", self, message)
        self.jump(self.__block.import_point(message["value"]))
      case _:
        raise ValueError(f"Unknown message type '{message['type']}'")

  @abstractmethod
  async def run(self, point: 'Optional[BaseProgramPoint]', stack: EvalStack):
    ...

class HeadProgram(BaseProgram):
  @abstractmethod
  async def pause(self) -> bool:
    ...

  @abstractmethod
  async def resume(self, *, loose: bool) -> bool:
    ...

  def stable(self):
    return False

class BaseProgramPoint(ABC):
  pass

class BaseBlock(ABC, HierarchyNode):
  def create_program(self, handle: 'ProgramHandle') -> BaseProgram:
    ...

  @abstractmethod
  def import_point(self, data: Any, /) -> BaseProgramPoint:
    ...

  @abstractmethod
  def export(self):
    ...

# @deprecated
BlockAttrs = dict[str, dict[str, Any | EllipsisType]]

Attrs = dict[str, Any]
AttrsOptional = dict[str, Any | EllipsisType]

class BaseParser(ABC):
  namespace: str
  layer_attributes: Optional[dict[str, lang.Attribute]] = None
  root_attributes = dict[str, lang.Attribute]()

  transformers: 'list[BaseTransformer]'

  def __init__(self, fiber: 'FiberParser'):
    self.leaf_transformers = list[BasePartialPassiveTransformer]()

  def enter_protocol(self, attrs: Attrs, /, adoption_envs: EvalEnvs, runtime_envs: EvalEnvs) -> tuple[lang.Analysis, ProtocolUnitData]:
    return lang.Analysis(), ProtocolUnitData()

  def leave_protocol(self):
    return lang.Analysis()

class BaseDefaultTransform(ABC):
  priority: ClassVar[int]

  def __init__(self):
    self.adoption_envs = EvalEnvs()
    self.runtime_envs = EvalEnvs()

    self.priority: int

  @abstractmethod
  def adopt(self, adoption_envs: EvalEnvs, adoption_stack: EvalStack) -> tuple[lang.Analysis, tuple[Any, EvalStack] | EllipsisType]:
    ...

  @abstractmethod
  def execute(self, block: BaseBlock, data: Any) -> tuple[lang.Analysis, BaseBlock | EllipsisType]:
    ...

class BaseLeadTransform(ABC):
  def __init__(self):
    super().__init__()
    self.priority = 0

  @abstractmethod
  # def execute(self, execute: 'Callable[[Transforms], tuple[lang.Analysis, BaseBlock | EllipsisType]]') -> tuple[lang.Analysis, BaseBlock | EllipsisType]:
  def adopt(self, adoption_envs: EvalEnvs, adoption_stack: EvalStack) -> tuple[lang.Analysis, BaseBlock | EllipsisType]:
    ...

Transforms = list[BaseDefaultTransform | BaseLeadTransform]

@dataclass
class TransformerAdoptionResult:
  data: Any
  _: KW_ONLY
  adoption_stack: EvalStack = field(default_factory=EvalStack)

@dataclass
class PassiveTransformerPreparationResult:
  data: Any
  _: KW_ONLY
  adoption_envs: EvalEnvs = field(default_factory=EvalEnvs)
  runtime_envs: EvalEnvs = field(default_factory=EvalEnvs)


T = TypeVar('T')

@dataclass
class LeadTransformerPreparationResult(Generic[T]):
  data: T
  origin_area: LocationArea
  _: KW_ONLY
  adoption_envs: EvalEnvs = field(default_factory=EvalEnvs)
  runtime_envs: EvalEnvs = field(default_factory=EvalEnvs)

class BasePassiveTransformer(ABC):
  attributes = dict[str, lang.Attribute]()
  priority: ClassVar[int]

  def prepare(self, data: Attrs, /, adoption_envs: EvalEnvs, runtime_envs: EvalEnvs) -> tuple[lang.Analysis, Optional[PassiveTransformerPreparationResult] | EllipsisType]:
    return lang.Analysis(), PassiveTransformerPreparationResult(data)

  @abstractmethod
  def adopt(self, data: Any, /, adoption_stack: EvalStack, trace: Trace) -> tuple[lang.Analysis, Optional[TransformerAdoptionResult] | EllipsisType]:
    ...

  @abstractmethod
  def execute(self, data: Any, /, block: BaseBlock) -> tuple[lang.Analysis, BaseBlock | EllipsisType]:
    ...

class BasePartialPassiveTransformer(ABC):
  @abstractmethod
  def execute(self, block: BaseBlock) -> tuple[lang.Analysis, BaseBlock | EllipsisType]:
    ...

class BaseLeadTransformer(ABC):
  attributes = dict[str, lang.Attribute]()
  priority: ClassVar[int] = 0

  @abstractmethod
  def prepare(self, data: Attrs, /, adoption_envs: EvalEnvs, runtime_envs: EvalEnvs) -> tuple[lang.Analysis, list[LeadTransformerPreparationResult] | EllipsisType]:
    return lang.Analysis(), list()

  @abstractmethod
  def adopt(self, data: Any, /, adoption_stack: EvalStack, trace: Trace) -> tuple[lang.Analysis, BaseBlock | EllipsisType]:
    ...

BaseTransformer = BasePassiveTransformer | BaseLeadTransformer
BaseTransformers = list[BaseTransformer]


@dataclass
class Layer:
  lead_transform: Optional[tuple[BaseLeadTransformer, LeadTransformerPreparationResult]]
  passive_transforms: list[tuple[BasePassiveTransformer, PassiveTransformerPreparationResult]]
  _: KW_ONLY
  adoption_envs: EvalEnvs
  runtime_envs: EvalEnvs
  extra_info: Optional[Attrs | EllipsisType] = None

  def adopt(self, adoption_stack: EvalStack, trace: Trace):
    analysis = lang.Analysis()
    current_adoption_stack = adoption_stack.copy()

    adopted_transforms = list[tuple[BasePassiveTransformer, Any]]()

    for transformer, transform in self.passive_transforms:
      transform_result = analysis.add(transformer.adopt(transform.data, current_adoption_stack, trace), trace=trace)

      if isinstance(transform_result, EllipsisType) or not transform_result:
        continue

      current_adoption_stack |= transform_result.adoption_stack
      adopted_transforms.append((transformer, transform_result.data))

    return analysis, (adopted_transforms, current_adoption_stack)

  def adopt_lead(self, adoption_stack: EvalStack, trace: Trace):
    assert self.lead_transform

    analysis, (adopted_transforms, current_adoption_stack) = self.adopt(adoption_stack, trace)

    lead_transformer, lead_transform = self.lead_transform
    block = analysis.add(lead_transformer.adopt(lead_transform.data, current_adoption_stack, trace), trace=trace)

    if isinstance(block, EllipsisType):
      return analysis, Ellipsis

    root_block = analysis.add(self.execute(adopted_transforms, block))

    return analysis, root_block

  def execute(self, adopted_transforms: list[tuple[BasePassiveTransformer, Any]], block: BaseBlock):
    analysis = lang.Analysis()
    current_block = block

    for transformer, transform_data in adopted_transforms[::-1]:
      if not isinstance(transform_data, EllipsisType):
        execute_result = analysis.add(transformer.execute(transform_data, current_block))

        if not isinstance(execute_result, EllipsisType):
          current_block = execute_result

    return analysis, current_block


# ----


# SimplifiedProcessParserAttrs = dict[str, Evaluable[LocatedValue[Any]]]

# class BaseSimplifiedProcessParser(ABC, BaseParser):
#   namespace: ClassVar[str]
#   priority: ClassVar[int]

#   @abstractmethod
#   def parse(self, attrs: Attrs, /) -> tuple[lang.Analysis, Exportable | EllipsisType]:
#     ...

#   def prepare(self, attrs: Attrs, /):
#     # if any(attr_name in attrs for attr_name in self.segment_attributes.keys()):
#     if attrs:
#       return lang.Analysis(), [SimplifiedProcessParserTransform(attrs, self)]

# @dataclass
# class SimplifiedProcessParserTransform(BaseLeadTransform):
#   attrs: SimplifiedProcessParserAttrs
#   parser: BaseSimplifiedProcessParser

#   def adopt(self, adoption_envs, runtime_envs, adoption_stack):
#     from .segment import SegmentTransform

#     attr_name, attr_value = next(iter(self.attrs.items()))
#     analysis, eval_result = attr_value.eval(EvalContext(adoption_stack), final=False)

#     if isinstance(eval_result, EllipsisType):
#       return analysis, eval_result

#     process_data = analysis.add(self.parser.parse({ attr_name: eval_result }))

#     if isinstance(process_data, EllipsisType):
#       return analysis, process_data

#     return analysis, Layer(
#       # [StateApplierTransform(settle=True)],
#       list(),
#       SegmentTransform(self.parser.namespace, process_data)
#     ).adopt(adoption_envs, runtime_envs, adoption_stack)


# ----


@dataclass(kw_only=True)
class AnalysisContext:
  envs_list: list[EvalEnvs] = field(default_factory=list)
  eval_context: Optional[EvalContext] = None
  eval_depth: int = 0
  symbolic: bool = False

  def update(self, **kwargs):
    return type(self)(**{ **self.__dict__, **kwargs })


# ----


@dataclass(kw_only=True)
class FiberProtocol(Exportable):
  details: ProtocolDetails
  draft: Draft
  global_env: EvalEnv
  name: Optional[str]
  root: BaseBlock
  user_env: EvalEnv

  def export(self):
    return {
      "draft": self.draft.export(),
      "name": self.name,
      "root": self.root.export()
    }


class FiberParser:
  def __init__(self, draft: Draft, *, Parsers: Sequence[type[BaseParser]], host: 'Host'):
    self._parsers: list[BaseParser] = [Parser(self) for Parser in Parsers]

    self.draft = draft
    self.host = host
    self.user_env = EvalEnv(name="User")

    self.analysis, protocol = self._parse()
    self.protocol = protocol if not isinstance(protocol, EllipsisType) else None

  def _parse(self):
    # Initialization

    analysis = lang.Analysis()

    global_env = EvalEnv({
      'ExpPath': EvalEnvValue(),
      'Path': EvalEnvValue(),
      'unit': EvalEnvValue()
    }, name="Global", readonly=True)

    adoption_envs = [global_env]
    runtime_envs = [global_env, self.user_env]


    # Syntax

    data, reader_errors, reader_warnings = reader.loads(self.draft.entry_document.source)

    analysis.errors += reader_errors
    analysis.warnings += reader_warnings


    # Root dictionary

    root_type = lang.DivisibleCompositeDictType()

    root_type.add({
      'name': lang.Attribute(
        label="Protocol name",
        description="The protocol's name.",
        type=lang.StrType()
      ),
      'steps': lang.Attribute(
        type=lang.AnyType(),
        required=True
      )
    }, key=0)

    for parser in self._parsers:
      root_type.add(parser.root_attributes, key=parser)

    context = AnalysisContext()
    root_result = analysis.add(root_type.analyze(data, context))

    if isinstance(root_result, EllipsisType):
      return analysis, Ellipsis


    # Transformers

    transformers = BaseTransformers()

    for parser in self._parsers:
      transformers += parser.transformers

    self.transformers = sorted(transformers, key=(lambda transformer: -transformer.priority))
    del transformers


    # Root block type (1)

    self.block_type = lang.DivisibleCompositeDictType()

    for transformer in self.transformers:
      self.block_type.add(transformer.attributes, key=transformer)


    # Root unit attributes

    protocol_details = ProtocolDetails()

    for parser in self._parsers:
      unit_attrs = analysis.add(root_type.analyze_namespace(root_result, context, key=parser))

      if isinstance(unit_attrs, EllipsisType):
        continue

      protocol_unit_data = analysis.add(parser.enter_protocol(unit_attrs, adoption_envs=adoption_envs, runtime_envs=runtime_envs))

      adoption_envs += protocol_unit_data.adoption_envs
      runtime_envs += protocol_unit_data.runtime_envs

      if protocol_unit_data.details:
        protocol_details[parser.namespace] = protocol_unit_data.details

      # TODO: Split BaseParser.enter_protocol() in two
      #   (1) one method to create envs e.g. devices
      #   (2) one method to consume envs e.g. shorthands
      # Or sort parsers to create envs before consuming them


    # Root block type (2)

    self.block_type = lang.DivisibleCompositeDictType()

    for parser in self._parsers:
      if parser.layer_attributes is not None:
        self.block_type.add(parser.layer_attributes, key=parser)

    for transformer in self.transformers:
      self.block_type.add(transformer.attributes, key=transformer)


    # Root block

    root_result_native = analysis.add(root_type.analyze_namespace(root_result, context, key=0))

    if isinstance(root_result_native, EllipsisType):
      return analysis, Ellipsis

    # def adoption_open(**kwargs):
    #   raise NotImplementedError

    adoption_stack: EvalStack = {
      global_env: {
        'ExpPath': PurePath,
        'Path': Path,
        # 'open': adoption_open,
        'unit': ureg
      }
    }

    for protocol_unit_details in protocol_details.values():
      adoption_stack |= protocol_unit_details.create_adoption_stack()

    layer = analysis.add(self.parse_layer(root_result_native['steps'], adoption_envs, runtime_envs))

    if isinstance(layer, EllipsisType):
      return analysis, Ellipsis

    root_block = analysis.add(layer.adopt_lead(adoption_stack, trace=Trace()))

    # root_block_prep = analysis.add(self.prepare_block(root_result_native['steps'], adoption_envs=adoption_envs, runtime_envs=runtime_envs))

    # if isinstance(root_block_prep, EllipsisType):
    #   return analysis, Ellipsis

    # root_block_data = analysis.add(self.parse_block(root_block_prep, adoption_stack))

    # if isinstance(root_block_data, EllipsisType):
    #   return analysis, Ellipsis

    # root_block = analysis.add(self.execute(root_block_data.state, root_block_data.transforms, origin_area=root_result_native['steps'].area))

    print("\x1b[1;31mAnalysis →\x1b[22;0m", analysis.errors)
    # print(root_block)

    if isinstance(root_block, EllipsisType):
      return analysis, Ellipsis


    # Leave

    for parser in self._parsers:
      analysis += parser.leave_protocol()


    # Return

    return analysis, FiberProtocol(
      details=protocol_details,
      draft=self.draft,
      global_env=global_env,
      name=root_result_native['name'],
      root=root_block,
      user_env=self.user_env
    )


  def parse_layer(
    self,
    attrs: Any,
    /,
    adoption_envs: EvalEnvs,
    runtime_envs: EvalEnvs,
    *,
    extra_attributes: Optional[dict[str, lang.Attribute | lang.Type]] = None,
    mode: Literal['any', 'lead', 'passive'] = 'lead'
  ):
    analysis = lang.Analysis()
    context = AnalysisContext(
      envs_list=[adoption_envs, runtime_envs]
    )

    if extra_attributes is not None:
      block_type = self.block_type.copy()
      block_type.add(extra_attributes, key=1)
    else:
      block_type = self.block_type

    block_result = analysis.add(block_type.analyze(attrs, context))

    if isinstance(block_result, EllipsisType):
      return analysis, Ellipsis

    # Process extra info

    if extra_attributes is not None:
      extra_info = analysis.add(block_type.analyze_namespace(block_result, context, key=1))
    else:
      extra_info = None

    # Collect transforms

    lead_transforms = list[tuple[BaseLeadTransformer, LeadTransformerPreparationResult]]()
    passive_transforms = list[tuple[BasePassiveTransformer, PassiveTransformerPreparationResult]]()

    extra_adoption_envs = EvalEnvs()
    extra_runtime_envs = EvalEnvs()

    result_by_parser = dict[BaseParser, Any]()

    for parser in self._parsers:
      if hasattr(parser, 'preload'):
        result = analysis.add(self.block_type.analyze_namespace(block_result, context, key=parser))

        if isinstance(result, EllipsisType):
          return analysis, Ellipsis

        _ = analysis.add(parser.preload(result))
        result_by_parser[parser] = result

    for transformer in self.transformers:
      parser = next(parser for parser in self._parsers if transformer in parser.transformers)

      current_adoption_envs = adoption_envs + extra_adoption_envs
      current_runtime_envs = runtime_envs + extra_runtime_envs

      context = AnalysisContext(
        envs_list=[current_adoption_envs, current_runtime_envs]
      )

      if parser.layer_attributes is not None:
        unit_attrs = result_by_parser[parser]
      else:
        unit_attrs = analysis.add(self.block_type.analyze_namespace(block_result, context, key=transformer))

      if isinstance(unit_attrs, EllipsisType):
        continue

      if isinstance(transformer, BaseLeadTransformer):
        new_lead_transforms = analysis.add(transformer.prepare(unit_attrs, current_adoption_envs, current_runtime_envs))

        if not isinstance(new_lead_transforms, EllipsisType):
          if (not lead_transforms) and new_lead_transforms:
            extra_adoption_envs += new_lead_transforms[0].adoption_envs
            extra_runtime_envs += new_lead_transforms[0].runtime_envs

          lead_transforms += [(transformer, transform) for transform in new_lead_transforms]
      else:
        new_passive_transform = analysis.add(transformer.prepare(unit_attrs, current_adoption_envs, current_runtime_envs))

        if new_passive_transform and not isinstance(new_passive_transform, EllipsisType):
          extra_adoption_envs += new_passive_transform.adoption_envs
          extra_runtime_envs += new_passive_transform.runtime_envs

          passive_transforms.append((transformer, new_passive_transform))

    if (mode == 'passive') and lead_transforms:
      analysis.errors.append(LeadTransformInPassiveLayerError(attrs))
    if (mode != 'passive') and (len(lead_transforms) > 1):
      analysis.errors.append(DuplicateLeadTransformInLayerError([transform.origin_area for _, transform in lead_transforms]))
    if (mode == 'lead') and (len(lead_transforms) < 1):
      analysis.errors.append(MissingLeadTransformInLayerError(attrs))
      return analysis, Ellipsis

    for _, transform in lead_transforms:
      analysis.tokens.append(lang.AnalysisToken("lead", ErrorDocumentReference.from_area(transform.origin_area)))

    layer = Layer(
      (lead_transforms[0] if lead_transforms else None),
      passive_transforms,
      adoption_envs=extra_adoption_envs,
      extra_info=extra_info,
      runtime_envs=extra_runtime_envs
    )

    return analysis, layer

  def wrap(self, block: BaseBlock, /):
    analysis = lang.Analysis()
    current_block = block

    for parser in self._parsers:
      for transformer in parser.leaf_transformers:
        current_block = analysis.add(transformer.execute(block))

        if isinstance(current_block, EllipsisType):
          return analysis, Ellipsis

    return analysis, current_block

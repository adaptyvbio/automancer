from abc import ABC, abstractmethod
from dataclasses import KW_ONLY, dataclass, field
import getpass
import math
from types import EllipsisType
from typing import (TYPE_CHECKING, Any, ClassVar, Generic, Literal, Optional,
                    Sequence, TypeVar, final)

from ..eta import DurationTerm, Term
from ..staticanalysis.expr import DeferredExprDef
from ..staticanalysis.support import prelude
from ..staticanalysis.expression import instantiate_type_instance
from .. import input as lang
from .. import reader
from ..draft import Draft
from ..error import Diagnostic, DiagnosticDocumentReference, Trace
from ..langservice import LanguageServiceAnalysis, LanguageServiceToken
from ..reader import LocatedString, LocatedValue, LocationArea
from ..ureg import ureg
from ..util.decorators import debug
from ..util.misc import Exportable, ExportableABC, HierarchyNode
from .eval import EvalContext, EvalEnv, EvalEnvs, EvalEnvValue, EvalStack, EvalSymbol, EvalVariables
from .expr import Evaluable

if TYPE_CHECKING:
  from ..host import Host
  from ..units.base import BaseRunner
  from .master2 import Mark, ProgramHandle
  from .process import BaseProcess


class DuplicateLeadTransformInLayerError(Diagnostic):
  def __init__(self, targets: list[LocationArea]):
    super().__init__(
      "Duplicate lead transform in layer",
      references=[DiagnosticDocumentReference.from_area(target) for target in targets]
    )

class LeadTransformInPassiveLayerError(Diagnostic):
  def __init__(self, target: LocatedValue):
    super().__init__(
      "Lead transform in passive layer",
      references=[DiagnosticDocumentReference.from_value(target)]
    )

class MissingLeadTransformInLayerError(Diagnostic):
  def __init__(self, target: LocatedValue):
    super().__init__(
      "Missing lead transform in layer",
      references=[DiagnosticDocumentReference.from_value(target)]
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
  envs: EvalEnvs = field(default_factory=EvalEnvs)

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
        self.jump(self.__block.import_point(message["value"]))
      case _:
        raise ValueError(f"Unknown message type '{message['type']}'")

  def study_block(self, block: 'BaseBlock') -> 'Optional[tuple[BaseProgramPoint, Mark]]':
    return None

  def swap(self, block: 'BaseBlock'):
    pass

  def term_info(self, children_terms: dict[int, Term]) -> tuple[Term, dict[int, Term]]:
    return DurationTerm.unknown(), dict()

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

class BaseProgramPoint(ExportableABC):
  pass

class BaseBlock(ABC, HierarchyNode):
  def duration(self):
    return DurationTerm.unknown()

  @abstractmethod
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
  namespace: ClassVar[str]
  layer_attributes: Optional[dict[str, lang.Attribute]] = None
  root_attributes = dict[str, lang.Attribute]()

  transformers: 'list[BaseTransformer]'

  def __init__(self, fiber: 'FiberParser'):
    self.leaf_transformers = list[BasePartialPassiveTransformer]()

  def enter_protocol(self, attrs: Attrs, /, envs: EvalEnvs) -> tuple[LanguageServiceAnalysis, ProtocolUnitData]:
    return LanguageServiceAnalysis(), ProtocolUnitData()

  def leave_protocol(self):
    return LanguageServiceAnalysis()

class BaseDefaultTransform(ABC):
  priority: ClassVar[int]

  def __init__(self):
    self.envs = EvalEnvs()
    self.priority: int

  @abstractmethod
  def adopt(self, adoption_envs: EvalEnvs, adoption_stack: EvalStack) -> tuple[LanguageServiceAnalysis, tuple[Any, EvalStack] | EllipsisType]:
    ...

  @abstractmethod
  def execute(self, block: BaseBlock, data: Any) -> tuple[LanguageServiceAnalysis, BaseBlock | EllipsisType]:
    ...

class BaseLeadTransform(ABC):
  def __init__(self):
    super().__init__()
    self.priority = 0

  @abstractmethod
  # def execute(self, execute: 'Callable[[Transforms], tuple[LanguageServiceAnalysis, BaseBlock | EllipsisType]]') -> tuple[LanguageServiceAnalysis, BaseBlock | EllipsisType]:
  def adopt(self, adoption_envs: EvalEnvs, adoption_stack: EvalStack) -> tuple[LanguageServiceAnalysis, BaseBlock | EllipsisType]:
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
  envs: EvalEnvs = field(default_factory=EvalEnvs)


T = TypeVar('T')

@dataclass
class LeadTransformerPreparationResult(Generic[T]):
  data: T
  origin_area: LocationArea
  _: KW_ONLY
  envs: EvalEnvs = field(default_factory=EvalEnvs)

class BasePassiveTransformer(ABC):
  def __init__(self, attributes: Optional[dict[str, lang.Attribute]] = None, *, priority: int):
    self.attributes = attributes or dict()
    self.priority = priority

  def prepare(self, data: Attrs, /, envs: EvalEnvs) -> tuple[LanguageServiceAnalysis, Optional[PassiveTransformerPreparationResult] | EllipsisType]:
    return LanguageServiceAnalysis(), PassiveTransformerPreparationResult(data) if data else None

  def adopt(self, data: Any, /, adoption_stack: EvalStack, trace: Trace) -> tuple[LanguageServiceAnalysis, Optional[TransformerAdoptionResult] | EllipsisType]:
    analysis = LanguageServiceAnalysis()
    result = analysis.add_mapping({ attr_name: attr_value.evaluate_provisional(EvalContext(adoption_stack)) for attr_name, attr_value in data.items() })

    if any(isinstance(attr_result, EllipsisType) for attr_result in result.values()):
      return analysis, Ellipsis

    return analysis, TransformerAdoptionResult(result)

  @abstractmethod
  def execute(self, data: Any, /, block: BaseBlock) -> tuple[LanguageServiceAnalysis, BaseBlock | EllipsisType]:
    ...

class BasePartialPassiveTransformer(ABC):
  @abstractmethod
  def execute(self, block: BaseBlock) -> tuple[LanguageServiceAnalysis, BaseBlock | EllipsisType]:
    ...

class BaseLeadTransformer(ABC):
  def __init__(self, attributes: Optional[dict[str, lang.Attribute]] = None):
    self.attributes = attributes or dict()
    self.priority = 0

  @abstractmethod
  def prepare(self, data: Attrs, /, envs: EvalEnvs) -> tuple[LanguageServiceAnalysis, list[LeadTransformerPreparationResult] | EllipsisType]:
    return LanguageServiceAnalysis(), list()

  @abstractmethod
  def adopt(self, data: Any, /, adoption_stack: EvalStack, trace: Trace) -> tuple[LanguageServiceAnalysis, BaseBlock | EllipsisType]:
    ...

BaseTransformer = BasePassiveTransformer | BaseLeadTransformer
BaseTransformers = list[BaseTransformer]


@final
class ProcessTransformer(BaseLeadTransformer):
  def __init__(self, Process: 'type[BaseProcess]', attributes: dict[str, lang.Attribute], *, parser: 'FiberParser'):
    assert attributes and (len(attributes) == 1)

    for attr in attributes.values():
      # TODO: Change this depending on whether attr._type is a DynamicType instance
      attr._type = lang.AutoExprContextType(lang.PotentialExprType(attr._type))

    super().__init__(attributes)

    self._Process = Process
    self._parser = parser

  def prepare(self, data: dict[LocatedString, LocatedValue], /, envs):
    if data:
      key, value = next(iter(data.items()))
      return LanguageServiceAnalysis(), [LeadTransformerPreparationResult(value, origin_area=key.area)]
    else:
      return LanguageServiceAnalysis(), list()

  def adopt(self, data: Evaluable, /, adoption_stack, trace):
    from .process import ProcessBlock

    analysis = LanguageServiceAnalysis()
    result = analysis.add(data.evaluate_provisional(EvalContext(adoption_stack)))

    if isinstance(result, EllipsisType):
      return analysis, Ellipsis

    block = analysis.add(self._parser.wrap(ProcessBlock(
      result,
      self._Process
    )))

    return analysis, block



@dataclass
class Layer:
  lead_transform: Optional[tuple[BaseLeadTransformer, LeadTransformerPreparationResult]]
  passive_transforms: list[tuple[BasePassiveTransformer, PassiveTransformerPreparationResult]]
  _: KW_ONLY
  envs: EvalEnvs
  extra_info: Optional[Attrs | EllipsisType] = None

  def adopt(self, adoption_stack: EvalStack, trace: Trace):
    analysis = LanguageServiceAnalysis()
    current_adoption_stack = adoption_stack.copy()

    adopted_transforms = list[tuple[BasePassiveTransformer, Any]]()

    for transformer, transform in self.passive_transforms:
      transform_result = analysis.add(transformer.adopt(transform.data, current_adoption_stack, trace)) #, trace=trace)

      if isinstance(transform_result, EllipsisType) or not transform_result:
        continue

      current_adoption_stack |= transform_result.adoption_stack
      adopted_transforms.append((transformer, transform_result.data))

    return analysis, (adopted_transforms, current_adoption_stack)

  def adopt_lead(self, adoption_stack: EvalStack, trace: Trace):
    assert self.lead_transform

    analysis, (adopted_transforms, current_adoption_stack) = self.adopt(adoption_stack, trace)

    lead_transformer, lead_transform = self.lead_transform
    block = analysis.add(lead_transformer.adopt(lead_transform.data, current_adoption_stack, trace)) #, trace=trace)

    if isinstance(block, EllipsisType):
      return analysis, Ellipsis

    root_block = analysis.add(self.execute(adopted_transforms, block))

    return analysis, root_block

  def execute(self, adopted_transforms: list[tuple[BasePassiveTransformer, Any]], block: BaseBlock):
    analysis = LanguageServiceAnalysis()
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
#   def parse(self, attrs: Attrs, /) -> tuple[LanguageServiceAnalysis, Exportable | EllipsisType]:
#     ...

#   def prepare(self, attrs: Attrs, /):
#     # if any(attr_name in attrs for attr_name in self.segment_attributes.keys()):
#     if attrs:
#       return LanguageServiceAnalysis(), [SimplifiedProcessParserTransform(attrs, self)]

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
  auto_expr: bool = False
  envs: Optional[EvalEnvs] = None
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
  global_symbol: EvalSymbol
  name: Optional[str]
  root: BaseBlock

  def export(self):
    return {
      "draft": self.draft.export(),
      "name": self.name,
      "root": self.root.export()
    }


class FiberParser:
  def __init__(self, draft: Draft, *, Parsers: Sequence[type[BaseParser]], host: 'Host'):
    # Must be before self._parsers is initialized
    self.draft = draft
    self.host = host

    self._next_eval_symbol = 0
    self._parsers: list[BaseParser] = [Parser(self) for Parser in Parsers]

    self.analysis, protocol = self._parse()
    self.protocol = protocol if not isinstance(protocol, EllipsisType) else None

  def _parse(self):
    # Initialization

    analysis = LanguageServiceAnalysis()

    global_symbol = self.allocate_eval_symbol()
    global_env = EvalEnv({
      'Path': EvalEnvValue(
        lambda node: DeferredExprDef('Path', node=node, phase=0, symbol=global_symbol),
        description="The Path class from the pathlib module."
      ),
      'open': EvalEnvValue(
        lambda node: DeferredExprDef('open', node=node, phase=0, symbol=global_symbol),
        description="The open() function, with the current experiment's directory as the current working directory."
      ),
      'math': EvalEnvValue(
        lambda node: DeferredExprDef('math', node=node, phase=0, symbol=global_symbol),
        description="The math module."
      ),
      'unit': EvalEnvValue(
        lambda node: DeferredExprDef('unit', node=node, phase=0, symbol=global_symbol),
        description="The unit registry."
      ),
      'username': EvalEnvValue(
        lambda node: DeferredExprDef('username', node=node, phase=0, symbol=global_symbol, type=instantiate_type_instance(prelude[0]['str'])),
        description="The user's name."
      )
    }, name="Global", symbol=global_symbol)

    root_envs = [global_env]


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
        type=lang.AnyType()
      )
    }, key=0)

    for parser in self._parsers:
      root_type.add(parser.root_attributes, key=parser, optional=True)

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
      self.block_type.add(transformer.attributes, key=transformer, optional=True)


    # Root unit attributes

    protocol_details = ProtocolDetails()

    for parser in self._parsers:
      unit_attrs = analysis.add(root_type.analyze_namespace(root_result, context, key=parser))

      if isinstance(unit_attrs, EllipsisType):
        continue

      protocol_unit_data = analysis.add(parser.enter_protocol(unit_attrs, root_envs))
      root_envs += protocol_unit_data.envs

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
        self.block_type.add(parser.layer_attributes, key=parser, optional=True)

    for transformer in self.transformers:
      self.block_type.add(transformer.attributes, key=transformer, optional=True)


    # Root block

    root_result_native = analysis.add(root_type.analyze_namespace(root_result, context, key=0))

    if isinstance(root_result_native, EllipsisType):
      return analysis, Ellipsis

    # def adoption_open(**kwargs):
    #   raise NotImplementedError

    adoption_stack: EvalStack = {
      global_symbol: {
        'math': math,
        'unit': ureg,
        'username': getpass.getuser()
      }
    }

    for protocol_unit_details in protocol_details.values():
      adoption_stack |= protocol_unit_details.create_adoption_stack()

    layer = analysis.add(self.parse_layer(root_result_native['steps'], root_envs))

    if isinstance(layer, EllipsisType):
      return analysis, Ellipsis

    root_block = analysis.add(layer.adopt_lead(adoption_stack, trace=Trace()))
    print("\x1b[1;31mAnalysis →\x1b[22;0m", analysis.errors)

    if isinstance(root_block, EllipsisType):
      return analysis, Ellipsis


    # Leave

    for parser in self._parsers:
      analysis += parser.leave_protocol()


    # Return

    return analysis, FiberProtocol(
      details=protocol_details,
      draft=self.draft,
      global_symbol=global_symbol,
      name=root_result_native['name'],
      root=root_block
    )


  def allocate_eval_symbol(self):
    symbol = EvalSymbol(self._next_eval_symbol)
    self._next_eval_symbol += 1

    return symbol

  def parse_layer(
    self,
    attrs: Any,
    /,
    envs: EvalEnvs,
    *,
    extra_attributes: Optional[dict[str, lang.Attribute | lang.Type]] = None,
    mode: Literal['any', 'lead', 'passive'] = 'lead'
  ):
    analysis = LanguageServiceAnalysis()
    context = AnalysisContext(
      envs=envs
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

    extra_envs = EvalEnvs()

    result_by_parser = dict[BaseParser, Any]()

    for parser in self._parsers:
      if hasattr(parser, 'preload'):
        result = analysis.add(self.block_type.analyze_namespace(block_result, context, key=parser))

        if isinstance(result, EllipsisType):
          return analysis, Ellipsis

        _ = analysis.add(parser.preload(result))
        result_by_parser[parser] = result

    failure = False

    for transformer in self.transformers:
      parser = next(parser for parser in self._parsers if transformer in parser.transformers)

      current_envs = envs + extra_envs
      context = AnalysisContext(envs=current_envs)

      if parser.layer_attributes is not None:
        unit_attrs = result_by_parser[parser]
      else:
        unit_attrs = analysis.add(self.block_type.analyze_namespace(block_result, context, key=transformer))

      if isinstance(unit_attrs, EllipsisType):
        failure = failure or isinstance(transformer, BaseLeadTransformer)
        continue

      if isinstance(transformer, BaseLeadTransformer):
        new_lead_transforms = analysis.add(transformer.prepare(unit_attrs, current_envs))

        if not isinstance(new_lead_transforms, EllipsisType):
          if (not lead_transforms) and new_lead_transforms:
            extra_envs += new_lead_transforms[0].envs

          lead_transforms += [(transformer, transform) for transform in new_lead_transforms]
      else:
        new_passive_transform = analysis.add(transformer.prepare(unit_attrs, current_envs))

        if new_passive_transform and not isinstance(new_passive_transform, EllipsisType):
          extra_envs += new_passive_transform.envs

          passive_transforms.append((transformer, new_passive_transform))

    if (mode == 'passive') and lead_transforms:
      analysis.errors.append(LeadTransformInPassiveLayerError(attrs))
    if (mode != 'passive') and (len(lead_transforms) > 1):
      analysis.errors.append(DuplicateLeadTransformInLayerError([transform.origin_area for _, transform in lead_transforms]))

    if failure:
      return analysis, Ellipsis

    if (mode == 'lead') and (len(lead_transforms) < 1):
      analysis.errors.append(MissingLeadTransformInLayerError(attrs))
      return analysis, Ellipsis

    # TODO: Add token even for failed transformers
    for _, transform in lead_transforms:
      analysis.tokens.append(LanguageServiceToken("lead", DiagnosticDocumentReference.from_area(transform.origin_area)))

    layer = Layer(
      (lead_transforms[0] if lead_transforms else None),
      passive_transforms,
      envs=extra_envs,
      extra_info=extra_info,
    )

    return analysis, layer

  def wrap(self, block: BaseBlock, /):
    analysis = LanguageServiceAnalysis()
    current_block = block

    for parser in self._parsers:
      for transformer in parser.leaf_transformers:
        current_block = analysis.add(transformer.execute(block))

        if isinstance(current_block, EllipsisType):
          return analysis, Ellipsis

    return analysis, current_block

import ast
import functools
from dataclasses import dataclass
from types import EllipsisType
from typing import TYPE_CHECKING, Any, cast, final

import automancer as am
from pr1.devices.nodes.collection import CollectionNode
from pr1.devices.nodes.common import BaseNode, NodePath
from pr1.devices.nodes.numeric import NumericNode
from pr1.devices.nodes.primitive import BooleanNode, EnumNode
from pr1.devices.nodes.value import Null, ValueNode
from pr1.fiber.eval import EvalContext, EvalEnv, EvalEnvValue, EvalSymbol
from pr1.fiber.expr import Evaluable, export_value
from pr1.fiber.parser import (BaseBlock, BaseParser,
                              BasePartialPassiveTransformer,
                              BasePassiveTransformer, BlockUnitState,
                              FiberParser, ProtocolUnitData,
                              ProtocolUnitDetails, TransformerAdoptionResult)
from pr1.input import (AnyType, Attribute, AutoExprContextType, BoolType, ChainType,
                       EnumType, PrimitiveType, QuantityType, Type)
from pr1.reader import LocatedValue
from pr1.util.decorators import debug

from . import namespace

if TYPE_CHECKING:
  from .runner import Runner


@dataclass
class DevicesProtocolDetails(ProtocolUnitDetails):
  symbol: EvalSymbol

  def create_runtime_stack(self, runner: 'Runner'):
    return {
      self.symbol: runner._master.host.root_node
    }


@dataclass
@final
class ApplierBlock(BaseBlock):
  child: BaseBlock

  def __get_node_children__(self):
    return [self.child]

  def __get_node_name__(self):
    return "State applier"

  def duration(self):
    return self.child.duration()

  def create_program(self, handle):
    from .program import ApplierProgram
    return ApplierProgram(self, handle)

  def import_point(self, data, /):
    return self.child.import_point(data)

  def export(self, context):
    return {
      "namespace": namespace,
      "name": "applier",

      "child": self.child.export(context),
      "duration": self.duration().export()
    }


@dataclass
@final
class PublisherBlock(BaseBlock):
  assignments: dict[NodePath, Evaluable[LocatedValue[Any]]]
  child: BaseBlock
  stable: bool

  def __get_node_children__(self):
    return [self.child]

  def __get_node_name__(self):
    return "State publisher"

  def duration(self):
    return self.child.duration()

  def create_program(self, handle):
    from .program import PublisherProgram
    return PublisherProgram(self, handle)

  def import_point(self, data, /):
    return self.child.import_point(data)

  def export(self, context) -> object:
    return {
      "namespace": namespace,
      "name": "publisher",

      "assignments": [[path, value.export_inner(cast(ValueNode, context.host.root_node.find(path)).export_value)] for path, value in self.assignments.items()],
      "duration": self.duration().export(),
      "child": self.child.export(context),
      "stable": self.stable
    }


class NoneToNullType(Type):
  def analyze(self, obj, /, context):
    result = LocatedValue(am.Null, obj.area) if obj.value is None else obj
    return am.DiagnosticAnalysis(), am.EvaluableConstantValue(result) if context.auto_expr else result

class PublisherTransformer(BasePassiveTransformer):
  priority = 100

  def __init__(self, parser: 'Parser'):
    self._parser = parser

  @functools.cached_property
  def attributes(self):
    def get_type(node):
      match node:
        case BooleanNode():
          return PrimitiveType(bool)
        case EnumNode():
          return EnumType(*[case.id for case in node.cases])
        case NumericNode():
          return ChainType(
            QuantityType(node.context.dimensionality, allow_nil=node.nullable, min=(node.range[0] if node.range else None), max=(node.range[1] if node.range else None)),
            NoneToNullType()
          )
        case _:
          return AnyType()

    return {
      key: Attribute(
        description=(node.description or f"""Sets the value of "{node.label or node.id}"."""),
        # documentation=([f"Unit: {node.context!r}"] if isinstance(node, NumericNode) else None),
        label=node.label,
        optional=True,
        type=AutoExprContextType(get_type(node))
      ) for key, (node, path) in self._parser.node_map.items()
    } | {
      'stable': Attribute(
        optional=True,
        type=BoolType()
      )
    }

  def adopt(self, data: dict[str, Evaluable[LocatedValue[Any]]], /, adoption_stack, trace):
    analysis = am.LanguageServiceAnalysis()
    values = dict[NodePath, Evaluable[LocatedValue[Any]]]()

    stable = data['stable'].value if ('stable' in data) else False # type: ignore

    for key, value in data.items():
      if key == 'stable':
        continue

      node, path = self._parser.node_map[key]
      value = analysis.add(value.evaluate_provisional(EvalContext(adoption_stack)))

      if not isinstance(value, EllipsisType):
        values[path] = value

    if values:
      return analysis, TransformerAdoptionResult((values, stable))
    else:
      return analysis, None

  def execute(self, data: tuple[dict[NodePath, Evaluable[LocatedValue[Any]]], bool], /, block):
    values, stable = data
    return am.LanguageServiceAnalysis(), PublisherBlock(values, block, stable=stable)


class ApplierTransformer(BasePartialPassiveTransformer):
  def execute(self, block):
    return am.LanguageServiceAnalysis(), ApplierBlock(block)


class Parser(BaseParser):
  namespace = namespace

  def __init__(self, fiber: FiberParser):
    super().__init__(fiber)

    self._fiber = fiber

    self.leaf_transformers = [ApplierTransformer()]
    self.transformers = [PublisherTransformer(self)]

  @functools.cached_property
  def node_map(self):
    queue: list[tuple[BaseNode, NodePath]] = [(self._fiber.host.root_node, NodePath())]
    nodes = dict[str, tuple[BaseNode, NodePath]]()

    while queue:
      node, node_path = queue.pop()

      if isinstance(node, CollectionNode):
        for child_node in node.nodes.values():
          queue.append((
            child_node,
            NodePath((*node_path, child_node.id))
          ))

      if isinstance(node, ValueNode) and node.writable:
        nodes[".".join(node_path)] = node, node_path

    return nodes

  def enter_protocol(self, attrs, /, envs):
    def create_type(node: BaseNode, parent_path: NodePath = ()):
      node_path = (*parent_path, node.id)
      match node:
        case am.CollectionNode():
          return am.ClassDefWithTypeArgs(am.ClassDef(
            name='ConnectionNode',
            instance_attrs={
              'connected': am.instantiate_type_instance(am.prelude[0]['bool']),
              **{ child_node.id: child_node_type for child_node in node.nodes.values() if (child_node_type := create_type(child_node, node_path)) }
            }
          ))
        case am.ValueNode() if node.readable:
          return am.ClassDefWithTypeArgs(am.ClassDef(
            name='NumericNode',
            instance_attrs={
              'connected': am.instantiate_type_instance(am.prelude[0]['bool']),
              'value': am.UnknownDef()
            }
          ))
        case _:
          return None

    symbol = self._fiber.allocate_eval_symbol()

    env = EvalEnv({
      'devices': EvalEnvValue(
        lambda node: DevicesExprDef(self._fiber.host.root_node, NodePath(), symbol)
      )
    }, name="Devices", symbol=symbol)

    return am.LanguageServiceAnalysis(), ProtocolUnitData(details=DevicesProtocolDetails(symbol), envs=[env])


@dataclass(frozen=True)
class DevicesExprDef(am.BaseExprDef):
  system_node: am.BaseNode
  path: am.NodePath
  symbol: int

  # @functools.cached_property
  # def _node(self):
  #   return self.root_node.find(self.path)

  @property
  def node(self):
    return None

  @property
  def phase(self):
    return 1000

  @property
  def type(self):
    match self.system_node:
      case am.CollectionNode():
        return am.ClassDefWithTypeArgs(am.ClassDef(
          name='ConnectionNode',
          instance_attrs={
            'connected': am.instantiate_type_instance(am.prelude[0]['bool']),
          } | {
            child_node.id: am.UnknownDef() for child_node in self.system_node.nodes.values()
          }
        ))
      case am.ValueNode(readable=True):
        return am.ClassDefWithTypeArgs(am.ClassDef(
          name='NumericNode',
          instance_attrs={
            'connected': am.instantiate_type_instance(am.prelude[0]['bool']),
            'value': am.UnknownDef()
          }
        ))

  def get_attribute(self, name, node):
    if name == 'connected':
      return None

    match self.system_node:
      case am.CollectionNode() if (child_node := self.system_node.nodes.get(name)):
        return self.__class__(
          child_node,
          (*self.path, name),
          symbol=self.symbol
        )
      case am.ValueNode(readable=True) if name == 'value':
        return ValueNodeValueExprDef(self.path, self.symbol, node)
      case _:
        return None

  def to_evaluated(self) -> am.BaseExprEval:
    return super().to_evaluated()

@dataclass
class ValueNodeValueExprDef(am.BaseExprDef):
  path: NodePath
  symbol: int
  node: ast.expr

  @property
  def phase(self):
    return 1000

  @property
  def type(self):
    return am.UnknownDef()

  def to_evaluated(self) -> am.BaseExprEval:
    return ValueNodeValueComptimeExprEval(self.path, self.symbol)

@dataclass
class ValueNodeValueComptimeExprEval(am.BaseExprEval):
  path: am.NodePath
  symbol: int

  def evaluate(self, stack):
    if self.symbol in stack:
      root_node = stack[self.symbol]
      node = root_node.find(self.path)

      return ValueNodeValueRuntimeExprEval(node, self.path)
    else:
      return self

@dataclass
class ValueNodeValueRuntimeExprEval(am.BaseExprEval):
  node: am.ValueNode
  path: am.NodePath

  def evaluate(self, stack):
    return self

  def to_watched(self) -> am.BaseExprWatch:
    return ValueNodeValueExprWatch(self.node, self.path)

@dataclass
class ValueNodeValueExprWatch(am.BaseExprWatch):
  node: am.ValueNode
  path: am.NodePath

  @property
  def dependencies(self):
    return {ValueNodeValueDependency(self.node, self.path)}

  def evaluate(self, changed_dependencies):
    return self.node.value and self.node.value[1]

@dataclass(frozen=True)
class ValueNodeValueDependency(am.Dependency):
  node: am.ValueNode
  path: am.NodePath

  async def init(self):
    async for _ in self.watch():
      break

  async def watch(self):
    async for _ in am.Watcher([self.node], modes={'value'}):
      yield

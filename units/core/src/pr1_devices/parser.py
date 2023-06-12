import functools
from dataclasses import dataclass
from types import EllipsisType
from typing import TYPE_CHECKING, Any, Literal, final

import pr1 as am
from pr1.devices.nodes.collection import CollectionNode
from pr1.devices.nodes.common import BaseNode, NodePath
from pr1.devices.nodes.numeric import NumericNode
from pr1.devices.nodes.primitive import BooleanNode, EnumNode
from pr1.devices.nodes.value import ValueNode
from pr1.fiber.eval import EvalContext, EvalEnv, EvalEnvValue
from pr1.fiber.expr import Evaluable, export_value
from pr1.input import (AnyType, Attribute, AutoExprContextType, BoolType, EnumType,
                                   PotentialExprType, PrimitiveType,
                                   QuantityType)
from pr1.fiber.master2 import ProgramHandle
from pr1.fiber.parser import (BaseBlock, BaseParser,
                              BasePartialPassiveTransformer,
                              BasePassiveTransformer, BaseProgram, BlockUnitState,
                              FiberParser, ProtocolUnitData,
                              ProtocolUnitDetails, TransformerAdoptionResult)
from pr1.fiber.staticanalysis import (ClassDef, ClassRef, CommonVariables,
                                      StaticAnalysisAnalysis)
from pr1.reader import LocatedValue
from pr1.util.decorators import debug

from . import namespace

if TYPE_CHECKING:
  from .runner import Runner


EXPR_DEPENDENCY_METADATA_NAME = f"{namespace}.dependencies"

@dataclass(eq=True, frozen=True, kw_only=True)
class NodeDependencyMetadata:
  endpoint: Literal['connected', 'value']
  path: NodePath

NodeDependenciesMetadata = set[NodeDependencyMetadata]

class TrackedReadableNodeClassRef(ClassRef):
  def __init__(self, type_def: ClassDef, /, metadata: NodeDependencyMetadata):
    super().__init__(type_def)
    self.metadata = metadata

  def analyze_access(self):
    return StaticAnalysisAnalysis(metadata={
      EXPR_DEPENDENCY_METADATA_NAME: NodeDependenciesMetadata({self.metadata})
    })


class CollectionNodeWrapper:
  def __init__(self, node: CollectionNode, /):
    for child_node in node.nodes.values():
      if (wrapped_node := wrap_node(child_node)):
        setattr(self, child_node.id, wrapped_node)

class NumericReadableNodeWrapper:
  def __init__(self, node: NumericNode):
    self._node = node

  @property
  def value(self):
    return self._node.value


def wrap_node(node: BaseNode, /):
  match node:
    case CollectionNode():
      return CollectionNodeWrapper(node)
    case NumericNode() if node.readable:
      return NumericReadableNodeWrapper(node)
    case _:
      return None


@dataclass
class DevicesProtocolDetails(ProtocolUnitDetails):
  env: EvalEnv

  def create_runtime_stack(self, runner: 'Runner'):
    return {
      self.env: {
        'devices': wrap_node(runner._master.host.root_node)
      }
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

  def export(self):
    return {
      "namespace": namespace,
      "name": "applier",

      "child": self.child.export(),
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

  def export(self):
    return {
      "namespace": namespace,
      "name": "publisher",

      "assignments": [[path, export_value(value)] for path, value in self.assignments.items()],
      "duration": self.duration().export(),
      "child": self.child.export(),
      "stable": self.stable
    }


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
          return QuantityType(node.context.dimensionality, allow_nil=node.nullable, min=(node.range[0] if node.range else None), max=(node.range[1] if node.range else None))
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
      connected_ref = TrackedReadableNodeClassRef(
        CommonVariables['bool'],
        NodeDependencyMetadata(
          endpoint='connected',
          path=node_path
        )
      )

      match node:
        case CollectionNode():
          return ClassRef(ClassDef(
            name=node.id,
            instance_attrs={
              'connected': connected_ref,
              **{ child_node.id: child_node_type for child_node in node.nodes.values() if (child_node_type := create_type(child_node, node_path)) }
            }
          ))
        case NumericNode() if node.readable:
          return ClassRef(ClassDef(
            name=node.id,
            instance_attrs={
              'connected': connected_ref,
              'value': TrackedReadableNodeClassRef(
                CommonVariables['unknown'],
                NodeDependencyMetadata(
                  endpoint='value',
                  path=node_path
                )
              )
            }
          ))
        case _:
          return None

    symbol = self._fiber.allocate_eval_symbol()

    env = EvalEnv({
      # 'devices': EvalEnvValue(
      #   type=ClassRef(ClassDef(
      #     name='Devices',
      #     instance_attrs={
      #       device_node.id: device_node_type for device_node in self._fiber.host.root_node.nodes.values() if (device_node_type := create_type(device_node))
      #     }
      #   ))
      # )
    }, name="Devices", symbol=symbol)

    return am.LanguageServiceAnalysis(), ProtocolUnitData(details=DevicesProtocolDetails(env), envs=[env])


@debug
class DevicesState(BlockUnitState):
  def __init__(self, values: dict[NodePath, Evaluable]):
    self.values = values

  def export(self) -> object:
    return {
      "values": [
        [path, value.export()] for path, value in self.values.items()
      ]
    }

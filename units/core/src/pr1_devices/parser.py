import functools
from types import EllipsisType
from typing import Optional

from pr1.fiber.eval import EvalEnv, EvalEnvValue
from pr1.fiber.langservice import Analysis, AnyType, Attribute, PotentialExprType, PrimitiveType, QuantityType
from pr1.fiber.expr import Evaluable
from pr1.fiber.parser import BaseParser, BlockUnitData, BlockUnitPreparationData, BlockUnitState, FiberParser, ProtocolUnitData
from pr1.devices.node import BaseNode, BaseWritableNode, BooleanWritableNode, CollectionNode, NodePath, ScalarReadableNode, ScalarWritableNode
from pr1.fiber.staticanalysis import ClassDef, ClassRef, CommonVariables, StaticAnalysisAnalysis
from pr1.util.decorators import debug


DeviceDependenciesMetadata = set[NodePath]

class TrackedReadableNodeClassRef(ClassRef):
  def __init__(self, path: NodePath):
    super().__init__(CommonVariables['float'])
    self.path = path

  def analyze_access(self):
    return StaticAnalysisAnalysis(metadata={
      'devices': DeviceDependenciesMetadata({self.path})
    })


class DevicesParser(BaseParser):
  namespace = "devices"
  priority = 1100

  root_attributes = dict()

  def __init__(self, fiber: FiberParser):
    self._fiber = fiber

  @functools.cached_property
  def node_map(self) -> dict[str, tuple[BaseNode, NodePath]]:
    def add_node(node: BaseNode, parent_path: Optional[list[str]] = None):
      nodes = dict()
      path = (parent_path or list()) + [node.id]

      if isinstance(node, CollectionNode):
        for child in node.nodes.values():
          nodes.update(add_node(child, path))

      if isinstance(node, BaseWritableNode):
        nodes[".".join(path[1:])] = node, tuple(path[1:])

      return nodes

    return add_node(self._fiber.host.root_node)

  @functools.cached_property
  def segment_attributes(self):
    def get_type(node):
      match node:
        case BooleanWritableNode():
          return PrimitiveType(bool)
        case ScalarWritableNode(unit=None):
          return PrimitiveType(float)
        case ScalarWritableNode(deactivatable=deactivatable, unit=unit):
          return QuantityType(unit, allow_nil=deactivatable)
        case _:
          return AnyType()

    return { key: Attribute(
      description=node.description,
      documentation=([f"Unit: {node.unit:~P}"] if isinstance(node, ScalarWritableNode) and node.unit else None),
      label=node.label,
      optional=True,
      type=PotentialExprType(get_type(node))
    ) for key, (node, path) in self.node_map.items() }

  def enter_protocol(self, attrs, /, adoption_envs, runtime_envs):
    def create_type(node: BaseNode, parent_path: NodePath = ()):
      node_path = (*parent_path, node.id)

      match node:
        case CollectionNode():
          return ClassRef(ClassDef(
            name=node.id,
            instance_attrs={
              **{ child_node.id: child_node_type for child_node in node.nodes.values() if (child_node_type := create_type(child_node, node_path)) },
              'connected': ClassRef(CommonVariables['bool'])
            }
          ))
        case ScalarReadableNode():
          return TrackedReadableNodeClassRef(node_path)
        case _:
          return None

    env = EvalEnv({
      'devices': EvalEnvValue(
        type=ClassRef(ClassDef(
          name='Devices',
          instance_attrs={
            device_node.id: device_node_type for device_node in self._fiber.host.root_node.nodes.values() if (device_node_type := create_type(device_node))
          }
        ))
      )
    }, name="Devices", readonly=True)

    return Analysis(), ProtocolUnitData(runtime_envs=[env])

  def prepare_block(self, attrs, /, adoption_envs, runtime_envs):
    values = dict[NodePath, Evaluable]()

    for attr_key, attr_value in attrs.items():
      if isinstance(attr_value, EllipsisType): # ?
        continue

      # node, path = self.node_map[attr_key]
      values[attr_key] = attr_value

    return Analysis(), BlockUnitPreparationData(values)

  def parse_block(self, attrs, /, adoption_stack, trace):
    analysis = Analysis()
    values = dict[NodePath, Evaluable]()

    for key, value in attrs.items():
      node, path = self.node_map[key]
      value = analysis.add(value.evaluate(adoption_stack))

      if not isinstance(value, EllipsisType):
        values[path] = value

    return analysis, BlockUnitData(state=DevicesState(values))


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

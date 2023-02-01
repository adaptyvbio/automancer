import functools
from types import EllipsisType
from typing import Optional

from pr1.fiber.langservice import Analysis, AnyType, Attribute, PotentialExprType, PrimitiveType, QuantityType
from pr1.fiber.expr import Evaluable
from pr1.fiber.parser import BaseParser, BlockUnitData, BlockUnitPreparationData, BlockUnitState, FiberParser
from pr1.devices.node import BaseNode, BaseWritableNode, BooleanWritableNode, CollectionNode, NodePath, ScalarWritableNode
from pr1.util.decorators import debug


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

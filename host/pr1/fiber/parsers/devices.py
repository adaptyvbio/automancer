import functools
from pint import Quantity
from types import EllipsisType
from typing import Any, Optional

from ..eval import EvalEnvs, EvalStack
from ..langservice import Analysis, AnyType, Attribute, PrimitiveType, QuantityType
from ..expr import PythonExprEvaluator
from ..parser import BaseParser, BlockAttrs, BlockData, BlockUnitData, BlockUnitState, FiberParser
from ...devices.node import BaseNode, BaseWritableNode, BooleanWritableNode, CollectionNode, NodePath, ScalarWritableNode
from ...util import schema as sc
from ...util.decorators import debug


class DevicesParser(BaseParser):
  namespace = "devices"
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

  @property
  def segment_attributes(self):
    def get_type(node):
      match node:
        case BooleanWritableNode():
          return PrimitiveType(bool)
        case ScalarWritableNode(unit=None):
          return PrimitiveType(float)
        case ScalarWritableNode(unit=unit):
          return QuantityType(unit)
        case _:
          return AnyType()

    return { key: Attribute(
      description=(node.label or node.id),
      optional=True,
      type=get_type(node)
    ) for key, (node, path) in self.node_map.items() }


  def parse_block(self, block_attrs: BlockAttrs, /, adoption_envs: EvalEnvs, adoption_stack: EvalStack, runtime_envs: EvalEnvs) -> tuple[Analysis, BlockUnitData | EllipsisType]:
    attrs = block_attrs[self.namespace]
    values: dict[NodePath, Any] = dict()

    for attr_key, attr_value in attrs.items():
      if not isinstance(attr_value, EllipsisType):
        node, path = self.node_map[attr_key]
        values[path] = attr_value.value

    return Analysis(), BlockUnitData(state=DevicesState(values))


@debug
class DevicesState(BlockUnitState):
  def __init__(self, values: dict[NodePath, Any]):
    self.values = values

  def export(self) -> object:
    def export_value(value):
      match value:
        case bool():
          return "On" if value else "Off"
        case Quantity():
          return f"{value:.2fP~}"
        case _:
          return value

    return {
      "values": [
        [path, export_value(value)] for path, value in self.values.items()
      ]
    }

from typing import ClassVar

from .common import BaseNode, NodeId, NodePath


class CollectionNode(BaseNode):
  def __init__(self):
    super().__init__()

    self.nodes: dict[NodeId, BaseNode]

  def __get_node_children__(self):
    return self.nodes.values()

  def export(self):
    return {
      **super().export(),
      "nodes": { node.id: node.export() for node in self.nodes.values() }
    }

  def iter_all(self):
    yield from super().iter_all()

    for child_node in self.nodes.values():
      for node_path, node in child_node.iter_all():
        yield NodePath([self.id, *node_path]), node


class DeviceNode(CollectionNode):
  owner: ClassVar[str]

  def __init__(self):
    super().__init__()

  def export(self):
    return {
      **super().export(),
      "owner": self.owner
    }

from typing import ClassVar

from .common import BaseNode, NodeId, NodePath


class CollectionNode(BaseNode):
  def __init__(self):
    super().__init__()

    self.nodes: dict[NodeId, BaseNode]

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

  def format(self, *, prefix: str = str()):
    output = super().format() + "\n"
    nodes = list(self.nodes.values())

    for index, node in enumerate(nodes):
      last = index == (len(nodes) - 1)
      output += prefix + ("└── " if last else "├── ") + node.format(prefix=(prefix + ("    " if last else "│   "))) + (str() if last else "\n")

    return output


class DeviceNode(CollectionNode):
  owner: ClassVar[str]

  def __init__(self):
    super().__init__()

  def export(self):
    return {
      **super().export(),
      "owner": self.owner
    }

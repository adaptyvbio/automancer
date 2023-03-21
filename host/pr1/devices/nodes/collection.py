import asyncio
from typing import Awaitable, Callable
from .common import BaseNode, NodeId


class CollectionNode(BaseNode):
  def __init__(self):
    super().__init__()

    self.nodes: dict[NodeId, BaseNode]
    self._listening = False

  def walk(self, callback: Callable[[BaseNode], None], /):
    for node in self.nodes.values():
      if not isinstance(node, CollectionNode):
        callback(node)
      else:
        node.walk(callback)

  async def walk_async(self, callback: Callable[[BaseNode], Awaitable], /):
    await asyncio.gather(*[
      callback(self),
      *[node.walk_async(callback) for node in self.nodes.values() if isinstance(node, CollectionNode)]
    ])

  # def watch_connection(self, listener, /):
  #   regs = set[AsyncCancelable]()

  #   if not self._listening:
  #     self._listening = True

  #     for node in self.nodes.values():
  #       if isinstance(node, PolledReadableNode):
  #         regs.add(node.watch(self._trigger_listeners, interval))
  #       elif isinstance(node, BaseWatchableNode):
  #         regs.add(node.watch(self._trigger_listeners))

  #   reg = super().watch(listener)

  #   async def cancel():
  #     nonlocal reg

  #     await reg.cancel()
  #     await asyncio.wait([reg.cancel() for reg in regs])

  #   return AsyncCancelable(cancel)

  def export(self):
    return {
      **super().export(),
      "nodes": { node.id: node.export() for node in self.nodes.values() }
    }

  def format(self, *, prefix: str = str()):
    output = super().format() + "\n"
    nodes = list(self.nodes.values())

    for index, node in enumerate(nodes):
      last = index == (len(nodes) - 1)
      output += prefix + ("└── " if last else "├── ") + node.format(prefix=(prefix + ("    " if last else "│   "))) + (str() if last else "\n")

    return output


class DeviceNode(CollectionNode):
  def __init__(self):
    super().__init__()

    self.model: str
    self.owner: str

  def export(self):
    return {
      **super().export(),
      "model": self.model,
      "owner": self.owner
    }

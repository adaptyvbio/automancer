import asyncio
from pr1.devices.node import BaseWritableNode, CollectionNode

from pr1.host import Host
from pr1.units.base import BaseExecutor
from pr1.util import schema as sc

from . import logger


class Executor(BaseExecutor):
  def __init__(self, conf, *, host: Host):
    conf = sc.Schema({}).validate(conf)

    self._host = host
    self._registration = None

  async def instruct(self, instruction):
    match instruction["type"]:
      case "register":
        if self._registration is None:
          self._registration = self._host.root_node.watch(self._host.update_callback, interval=0.5)
          logger.info("Watching all nodes")

      case "write":
        node = self._host.root_node

        for segment in instruction["path"]:
          if isinstance(node, CollectionNode):
            node = node.nodes[segment]
          else:
            raise ValueError()

        if isinstance(node, BaseWritableNode):
          await node.write_import(instruction["value"])
        else:
          raise ValueError()

  async def destroy(self):
    if self._registration:
      self._registration.cancel()

    return logger.info("Stopped watching all nodes")

  def export(self):
    return {
      "root": self._host.root_node.export()
    }

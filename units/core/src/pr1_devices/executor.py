import asyncio
import traceback

from pr1.devices.node import BaseWritableNode, CollectionNode
from pr1.fiber.langservice import DictType
from pr1.host import Host
from pr1.units.base import BaseExecutor
from pr1.util import schema as sc

from . import logger


class Executor(BaseExecutor):
  options_type = DictType({})

  def __init__(self, conf, *, host: Host):
    self._host = host
    self._registration = None

    from .mock import MockDevice
    self._host.devices['Mock'] = MockDevice()

  async def instruct(self, instruction):
    match instruction["type"]:
      case "register":
        if self._registration is None:
          self._registration = self._host.root_node.watch(self._host.update_callback, interval=0.5)
          logger.info("Watching all nodes")

      case "write":
        node = self._host.root_node.find(instruction["path"])

        if isinstance(node, BaseWritableNode):
          async def write():
            try:
              await node.write_import(instruction["value"])
            except Exception:
              traceback.print_exc()

          # TODO: Find a way to cancel this task when destroying the executor.
          asyncio.create_task(write())
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

import asyncio

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
          self._registration = self._host.root_node.watch(self._host.update_callback, interval=1.0)
          logger.info("Watching all nodes")

      case "setValue":
        device = self._host.devices[instruction["deviceId"]]
        node = device.nodes[instruction["nodeIndex"]]

        async def write():
          await node.write_import(instruction["value"])
          self._host.update_callback()

        asyncio.create_task(write())

  async def destroy(self):
    if self._registration:
      self._registration.cancel()

    return logger.info("Stopped watching all nodes")

  def export(self):
    return {
      "root": self._host.root_node.export()
    }

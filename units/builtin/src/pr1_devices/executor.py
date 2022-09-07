import asyncio

from pr1.units.base import BaseExecutor
from pr1.util import schema as sc


class Executor(BaseExecutor):
  def __init__(self, conf, *, host):
    conf = sc.Schema({}).validate(conf)

    self._host = host

  async def instruct(self, instruction):
    device = self._host.devices[instruction["deviceId"]]
    node = device.nodes[instruction["nodeIndex"]]

    async def write():
      await node.write_import(instruction["value"])
      self._host.update_callback()

    asyncio.create_task(write())

  def export(self):
    return {
      "devices": {
        device_name: {
          "id": device.id,
          "connected": device.connected,
          "label": device.label,
          "model": device.model,
          "owner": device.owner,
          "nodes": [
            {
              "id": node.id,
              "connected": node.connected,
              "data": node.export(),
              "label": node.label
            } for node in device.nodes
          ]
        } for device_name, device in self._host.devices.items()
      }
    }

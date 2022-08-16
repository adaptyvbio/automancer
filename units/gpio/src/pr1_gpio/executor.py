from pr1.units.base import BaseExecutor
from pr1.util import schema as sc


class Executor(BaseExecutor):
  def __init__(self, conf, *, host):
    conf = sc.Schema({}).validate(conf)

    self._host = host

  async def instruct(self, instruction):
    device = self._host.devices[instruction["deviceId"]]

    if device.connected:
      node = device.nodes[instruction["nodeIndex"]]
      await node.write(instruction["value"])

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
              "data": {
                "type": node.type,
                "value": node.value
              }
            } for node in device.nodes
          ]
        } for device_name, device in self._host.devices.items()
      }
    }

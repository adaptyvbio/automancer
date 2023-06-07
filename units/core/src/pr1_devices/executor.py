from asyncio import Future
from typing import Any

import pr1 as am
from pr1.devices.claim import Claim
from pr1.units.base import BaseExecutor
from quantops import Quantity

from . import logger


class Executor(BaseExecutor):
  options_type = am.RecordType({})

  def __init__(self, conf, *, host: am.Host):
    self._channels = set()
    self._claims = dict[tuple[Any, am.ValueNode], Claim]()
    self._host = host

    # from .mock import MockDevice
    # dev = MockDevice()
    # self._host.devices[dev.id] = dev

  async def request(self, request, /, agent):
    match request["type"]:
      case "claim":
        node = self._host.root_node.find(request["nodePath"])

        if node and isinstance(node, am.ValueNode) and node.writable and not ((key := (agent, node)) in self._claims):
          claim1 = node.claim(agent, force=True)
          self._claims[key] = claim1

          async def func():
            try:
              await claim1.wait()
              await claim1.lost()
            finally:
              if claim1.alive:
                claim1.destroy()

              del self._claims[key]

          agent.pool.start_soon(func())

        return None
      case "listen":
        channel = agent.register_generator_channel(self._listen())
        self._channels.add(channel)

        return {
          "channelId": channel.id
        }
      case "release":
        node = self._host.root_node.find(request["nodePath"])

        if node and isinstance(node, am.ValueNode) and (claim2 := self._claims.get((agent, node))):
          claim2.destroy()
      case "set":
        node = self._host.root_node.find(request["nodePath"])

        match node:
          case am.NumericNode():
            node.writer.set(Quantity(
              dimensionality=node.context.dimensionality,
              registry=am.ureg,
              value=request["value"]
            ))
          case am.BooleanNode() | am.EnumNode():
            node.writer.set(request["value"])

  async def _listen(self):
    all_nodes = list(self._host.root_node.iter_all())
    node_paths_by_node = { node: node_path for node_path, node in all_nodes }

    watcher = am.Watcher([node for _, node in all_nodes], modes={'connection', 'ownership', 'value', 'target'})

    async with watcher:
      yield [[node_path, export_node_state(node)] for node_path, node in all_nodes]

      async for event in watcher:
        yield [[node_paths_by_node[node], export_node_state(node)] for node, _ in event.items()]

  async def start(self):
    yield

    try:
      await Future()
    finally:
      for channel in self._channels:
        await channel.close()

      self._channels.clear()

      logger.info("Stopped watching all nodes")

  def export(self):
    return {
      "root": self._host.root_node.export()
    }


def export_node_state(node: am.BaseNode, /):
  state = {
    "connected": node.connected,
    "valueEvent": None,
    "writer": None
  }

  if isinstance(node, am.ValueNode):
    state |= {
      "valueEvent": (node.value and {
        "time": (node.value[0] * 1000),
        "value": node.export_value(node.value[1])
      })
    }

    if node.writable:
      owner = node.claimable.owner()

      state |= {
        "writer": {
          "owner": (export_claim_marker(owner.marker) if owner else None),
          "targetValueEvent": ((target_value := node.writer.target_value) and {
            "time": (target_value[0] * 1000),
            "value": node.export_value(node.writer.target_value[1])
          })
        }
      }

  return state

def export_claim_marker(marker: Any, /):
  match marker:
    case _:
      return {
        "type": "client",
        "clientId": marker.client.id
      }

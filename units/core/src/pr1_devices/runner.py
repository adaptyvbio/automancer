import asyncio
from enum import IntEnum
import time
from dataclasses import dataclass
from typing import Any, Optional

from pr1.devices.claim import Claim, ClaimSymbol
from pr1.devices.node import BaseWritableNode, NodePath
from pr1.fiber.process import ProgramExecEvent
from pr1.host import Host
from pr1.units.base import BaseProcessRunner, BaseRunner

from . import namespace


class NodeWriteError(IntEnum):
  Disconnected = 0
  Unclaimable = 1


@dataclass
class StateLocation:
  values: dict[NodePath, Optional[NodeWriteError]]

  def export(self):
    return {
      "values": [
        [path, error] for path, error in self.values.items()
      ]
    }

class Runner(BaseRunner):
  def __init__(self, chip, *, host: Host):
    self._chip = chip
    self._host = host

    # from pr1.devices.claim import ClaimSymbol
    # print(self._host.devices['Mock'].nodes['valueBool'].claim_now(ClaimSymbol()))

    # self._executor = host.executors[namespace]

  async def hold(self, state, symbol: ClaimSymbol):
    # claims = dict[NodePath, Optional[Claim]]()

    def send_location():
      nonlocal event_future

      event_future.set_result(location)
      event_future = asyncio.Future()

    async def write_node(path: NodePath, initial_claim: Optional[Claim], node: BaseWritableNode, value: Any):
      claim = initial_claim

      try:
        while True:
          if not claim:
            claim = await node.claim(symbol)

          await asyncio.shield(node.write(value))
          await claim.lost()

          claim = None
          location.values[path] = NodeWriteError.Unclaimable
          send_location()
      finally:
        if claim and claim.valid:
          claim.release()

    event_future = asyncio.Future()
    location = StateLocation(values={ path: None for path in state.values.keys() })
    tasks = set()

    for path, value in state.values.items():
      node = self._host.root_node.find(path)
      assert isinstance(node, BaseWritableNode)

      claim = node.claim_now(symbol)

      if not claim:
        location.values[path] = NodeWriteError.Unclaimable

      if not node.connected:
        location.values[path] = NodeWriteError.Disconnected

      tasks.add(asyncio.create_task(write_node(path, claim, node, value)))

    yield location

    try:
      yield await event_future
    except asyncio.CancelledError:
      for task in tasks:
        task.cancel()

        try:
          await task
        except asyncio.CancelledError:
          pass

      raise

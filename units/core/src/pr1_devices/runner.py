import asyncio
import time
from dataclasses import dataclass
from typing import Any, Optional

from pr1.devices.claim import Claim
from pr1.devices.node import BaseWritableNode
from pr1.fiber.process import ProgramExecEvent
from pr1.host import Host
from pr1.units.base import BaseProcessRunner, BaseRunner

from . import namespace


@dataclass
class StateState:
  def export(self):
    return {

    }

class Runner(BaseRunner):
  def __init__(self, chip, *, host: Host):
    self._chip = chip
    self._host = host

    # from pr1.devices.claim import ClaimSymbol
    # print(self._host.devices['Mock'].nodes['valueBool'].claim_now(ClaimSymbol()))

    # self._executor = host.executors[namespace]

  async def hold(self, state, symbol):
    claims = set[Claim]()

    async def write_node(node: BaseWritableNode, value: Any):
      claim = node.claim_now(symbol)

      if not claim:
        print("Failed to claim", path)

      try:
        while True:
          if not claim:
            claim = await node.claim(symbol)

          claims.add(claim)

          await asyncio.shield(node.write(value))
          await claim.lost()

          claims.remove(claim)
      finally:
        if claim and claim.valid:
          claim.release()

    tasks = set()

    for path, value in state.values.items():
      node = self._host.root_node.find(path)
      assert isinstance(node, BaseWritableNode)

      tasks.add(asyncio.create_task(write_node(node, value)))

    try:
      await asyncio.Future()
    except asyncio.CancelledError:
      # print("Release state ->", state)
      for task in tasks:
        task.cancel()

        try:
          await task
        except asyncio.CancelledError:
          pass

      raise

    return
    yield

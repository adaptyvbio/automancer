import asyncio
from enum import IntEnum
import time
from dataclasses import dataclass
from typing import Any, Callable, Optional

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


class StateInstance:
  def __init__(self, runner: 'Runner', *, notify: Callable, symbol: ClaimSymbol):
    self._location: StateLocation
    self._notify = lambda: notify(self._location)
    self._runner = runner
    self._symbol = symbol
    self._tasks: set[asyncio.Task]

  async def _write_node(self, path: NodePath, initial_claim: Optional[Claim], node: BaseWritableNode, value: Any):
    claim = initial_claim
    print("Initial:", initial_claim, value)

    try:
      while True:
        if not claim:
          claim = await node.claim(self._symbol)
          print("Obtained:", claim)

          self._location.values[path] = None
          self._notify()

        await asyncio.shield(node.write(value))
        await claim.lost()
        print("Lost:", claim)

        claim = None
        self._location.values[path] = NodeWriteError.Unclaimable
        self._notify()
    finally:
      if claim and claim.valid:
        print("Release:", claim)
        claim.release()

  def apply(self, state, *, resume: bool):
    self._location = StateLocation(values={ path: None for path in state.values.keys() })
    self._tasks = set()

    for path, value in state.values.items():
      node = self._runner._host.root_node.find(path)
      assert isinstance(node, BaseWritableNode)

      claim = node.claim_now(self._symbol)

      if not claim:
        self._location.values[path] = NodeWriteError.Unclaimable

      if not node.connected:
        self._location.values[path] = NodeWriteError.Disconnected

      self._tasks.add(asyncio.create_task(self._write_node(path, claim, node, value)))

    return self._location

  def update(self, state):
    pass

  async def suspend(self):
    for task in self._tasks:
      task.cancel()

      try:
        await task
      except asyncio.CancelledError:
        pass

    del self._location
    del self._tasks


class Runner(BaseRunner):
  StateInstance = StateInstance

  def __init__(self, chip, *, host: Host):
    self._chip = chip
    self._host = host

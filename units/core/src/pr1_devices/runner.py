import asyncio
from enum import IntEnum
import time
from dataclasses import dataclass
from types import EllipsisType
from typing import Any, Callable, Optional

from pr1.devices.claim import Claim, ClaimSymbol
from pr1.devices.node import BaseWritableNode, NodePath
from pr1.fiber.eval import EvalStack
from pr1.fiber.expr import PythonExprContext
from pr1.fiber.process import ProgramExecEvent
from pr1.host import Host
from pr1.units.base import BaseProcessRunner, BaseRunner
from pr1.util.misc import race

from . import logger, namespace
from .parser import DevicesState


class NodeWriteError(IntEnum):
  Disconnected = 0
  Unclaimable = 1
  ExprError = 2


@dataclass
class StateLocation:
  values: dict[NodePath, Optional[NodeWriteError]]

  def export(self):
    return {
      "values": [
        [path, error] for path, error in self.values.items()
      ]
    }

@dataclass
class StateInstanceNodeInfo:
  node: BaseWritableNode
  path: NodePath
  task: asyncio.Task
  update_event: asyncio.Event
  value: Any


counter = 0

class StateInstance:
  def __init__(self, runner: 'Runner', *, notify: Callable, stack: EvalStack, symbol: ClaimSymbol):
    self._location: StateLocation
    self._notify = lambda: notify(self._location)
    self._runner = runner
    self._stack = stack
    self._symbol = symbol

    self._infos: dict[NodePath, StateInstanceNodeInfo]

    global counter
    self._logger = logger.getChild(f"stateInstance{counter}")
    counter = counter + 1

  def _add_node(self, path: NodePath, value: Any):
    node = self._runner._host.root_node.find(path)
    assert isinstance(node, BaseWritableNode)

    initial_claim = node.claim_now(self._symbol)

    if not initial_claim:
      self._location.values[path] = NodeWriteError.Unclaimable

    if not node.connected:
      self._location.values[path] = NodeWriteError.Disconnected

    info = StateInstanceNodeInfo(
      node=node,
      path=path,
      task=None, # type: ignore
      update_event=asyncio.Event(),
      value=value
    )

    info.task = asyncio.create_task(self._write_node(info, initial_claim))

    self._infos[path] = info
    self._location.values[path] = None


  async def _write_node(self, info: StateInstanceNodeInfo, initial_claim: Optional[Claim]):
    claim = initial_claim
    label = ".".join(info.path)

    try:
      while True:
        if not claim:
          claim = await info.node.claim(self._symbol)

          self._location.values[info.path] = None
          self._notify()

        self._logger.debug(f"Claimed node '{label}'")

        while True:
          if isinstance(info.value, PythonExprContext):
            analysis, result = info.value.evaluate(self._stack)

            if analysis.errors:
              self._location.values[info.path] = NodeWriteError.ExprError

              for err in analysis.errors:
                logger.warn(err.diagnostic().message)

            if isinstance(result, EllipsisType):
              await asyncio.Future()

            value = result
          else:
            value = info.value

          self._logger.debug(f"Writing node '{label}' with value {repr(value)}")
          await asyncio.shield(info.node.write(value))

          index, _ = await race(claim.lost(), info.update_event.wait())

          # The claim was lost
          if index == 0:
            break

          info.update_event.clear()

        self._logger.debug(f"Lost node '{label}'")

        claim = None
        self._location.values[info.path] = NodeWriteError.Unclaimable
        self._notify()
    finally:
      if claim and claim.valid:
        self._logger.debug(f"Released node '{label}'")
        claim.release()

  def apply(self, state: DevicesState, *, resume: bool):
    self._logger.debug("Applying state")

    self._infos = dict()
    self._location = StateLocation(values=dict())

    for path, value in state.values.items():
      self._add_node(path, value)

    return self._location

  def update(self, state: DevicesState):
    self._logger.debug("Updating state")

    async def cleanup():
      try:
        for info in list(self._infos.values()):
          if not info.path in state.values:
            info.task.cancel()

            try:
              await info.task
            except asyncio.CancelledError:
              pass

            del self._infos[info.path]
            del self._location.values[info.path]
      except Exception:
        import traceback
        traceback.print_exc()

    asyncio.create_task(cleanup())

    for path, value in state.values.items():
      info = self._infos.get(path)

      if info:
        info.update_event.set()
        info.value = value
      else:
        self._add_node(path, value)

  async def suspend(self):
    for info in self._infos.values():
      info.task.cancel()

      try:
        await info.task
      except asyncio.CancelledError:
        pass

    del self._infos
    del self._location

    # self._location = StateLocation({ 'a': 34 })
    # self._notify()
    # await asyncio.sleep(1)
    # self._location = StateLocation({ 'a': 100 })
    # self._notify()


class Runner(BaseRunner):
  StateInstance = StateInstance

  def __init__(self, chip, *, host: Host):
    self._chip = chip
    self._host = host

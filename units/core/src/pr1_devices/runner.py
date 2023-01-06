import asyncio
from enum import IntEnum
import time
from dataclasses import dataclass
from types import EllipsisType
from typing import Any, Callable, Optional

from pr1.devices.claim import Claim, ClaimSymbol, ClaimToken, ClaimTransferFailChildError, ClaimTransferFailUnknownError
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
  task: asyncio.Task[None]
  token: ClaimToken
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

    if not node.connected:
      self._location.values[path] = NodeWriteError.Disconnected
    else:
      self._location.values[path] = None

    info = StateInstanceNodeInfo(
      node=node,
      path=path,
      task=None, # type: ignore
      token=node.create_token(self._symbol),
      update_event=asyncio.Event(),
      value=value
    )

    # info.task = asyncio.create_task(self._write_node(info))
    self._infos[path] = info


  async def _node_lifecycle(self, info: StateInstanceNodeInfo):
    claim = None
    initial = True
    label = ".".join(info.path)

    try:
      while True:
        claim = await info.token.wait()

        self._location.values[info.path] = None

        if not initial:
          self._notify()

        self._logger.debug(f"Claimed node '{label}'")
        initial = False

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

          index, race_result = await race(claim.lost(), info.update_event.wait())

          # The claim was lost
          if index == 0:
            if not race_result:
              # The claim was not lost to a child
              self._location.values[info.path] = NodeWriteError.Unclaimable

            break

          info.update_event.clear()

        self._logger.debug(f"Lost node '{label}'")

        claim = None
        self._notify()
    finally:
      await info.token.cancel()
      self._logger.debug(f"Released node '{label}'")

  def prepare(self, state: DevicesState):
    self._logger.debug("Preparing state")

    self._infos = dict()
    self._location = StateLocation(values=dict())

    for path, value in state.values.items():
      self._add_node(path, value)

  async def apply(self, state: DevicesState, *, resume: bool):
    self._logger.debug("Applying state")

    for info in self._infos.values():
      try:
        await info.token.wait(err=True)
      except ClaimTransferFailChildError:
        pass
      except ClaimTransferFailUnknownError:
        self._logger.debug(f"Failed to claim '{info.node.id}'")
        self._location.values[info.path] = NodeWriteError.Unclaimable

      info.task = asyncio.create_task(self._node_lifecycle(info))

    self._logger.debug("Done applying state")

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
    self._logger.debug("Suspending")

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

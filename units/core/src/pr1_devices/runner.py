import asyncio
from enum import IntEnum
import time
from dataclasses import dataclass
from types import EllipsisType
from typing import Any, Callable, Optional

from pr1.devices.claim import ClaimOwner, ClaimSymbol, PerpetualClaim, ClaimTransferFailChildError, ClaimTransferFailUnknownError
from pr1.devices.node import BaseWritableNode, NodePath
from pr1.fiber.eval import EvalStack
from pr1.fiber.expr import PythonExprContext
from pr1.fiber.parser import BlockUnitState
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
  claim: PerpetualClaim
  node: BaseWritableNode
  path: NodePath
  task: asyncio.Task[None]
  update_event: asyncio.Event
  value: Any


class StateInstance:
  _next_index = 0

  def __init__(self, state: DevicesState, runner: 'Runner', *, notify: Callable, stack: EvalStack, symbol: ClaimSymbol):
    self._location: StateLocation
    self._notify = lambda: notify(self._location)
    self._runner = runner
    self._stack = stack
    self._state = state
    self._symbol = symbol

    self._infos: dict[NodePath, StateInstanceNodeInfo]

    self._logger = logger.getChild(f"stateInstance{self._next_index}")
    type(self)._next_index += 1


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

  def prepare(self):
    self._logger.debug("Preparing state")

    self._infos = dict()
    self._location = StateLocation(values=dict())

    for path, value in self._state.values.items():
      node = self._runner._host.root_node.find(path)
      assert isinstance(node, BaseWritableNode)

      info = StateInstanceNodeInfo(
        claim=node.create_claim(self._symbol),
        node=node,
        path=path,
        task=None, # type: ignore
        update_event=asyncio.Event(),
        value=value
      )

      # info.task = asyncio.create_task(self._write_node(info))
      self._infos[path] = info

  def apply(self):
    self._logger.debug("Applying state")

    for info in self._infos.values():
      if not info.node.connected:
        self._location.values[info.path] = NodeWriteError.Disconnected
      elif (not info.claim.owner) and (not info.claim.owned_by_child):
        self._location.values[info.path] = NodeWriteError.Unclaimable
        self._logger.debug(f"Failed to claim '{info.node.id}'")
      else:
        self._location.values[info.path] = None
        asyncio.create_task(info.node.write(info.value))

      # info.task = asyncio.create_task(self._node_lifecycle(info))

    self._logger.debug("Applied state")
    return self._location

  async def suspend(self):
    self._logger.debug("Suspending")

    for info in self._infos.values():
      info.claim.close()

      # info.task.cancel()

      # try:
      #   await info.task
      # except asyncio.CancelledError:
      #   pass

    del self._infos
    del self._location

    # self._location = StateLocation({ 'a': 34 })
    # self._notify()
    # await asyncio.sleep(1)
    # self._location = StateLocation({ 'a': 100 })
    # self._notify()


counter = 0

class DemoStateInstance:
  def __init__(self, state: BlockUnitState, runner: 'Runner', *, notify: Callable, stack: EvalStack, symbol: ClaimSymbol):
    global counter
    self._logger = logger.getChild(f"stateInstance{counter}")
    self._index = counter
    counter = counter + 1

    self._notify = notify

  def prepare(self, *, resume: bool):
    self._logger.debug(f'Prepare, resume={resume}')

  def apply(self, *, resume: bool):
    self._logger.debug(f'Apply, resume={resume}')

    async def task():
      await asyncio.sleep(0.7)
      print("Notify")
      self._notify(34)

    # if self._index == 0: asyncio.create_task(task())

  async def close(self):
    self._logger.debug('Close')

  async def suspend(self):
    self._logger.debug('Suspend')


class Runner(BaseRunner):
  StateInstance = DemoStateInstance

  def __init__(self, chip, *, host: Host):
    self._chip = chip
    self._host = host

  def transfer_state(self):
    logger.debug('Transfering claims')
    self._host.root_node.transfer_claims()

  def write_state(self):
    logger.debug('Write state')

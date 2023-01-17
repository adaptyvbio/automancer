import asyncio
from enum import IntEnum
import time
from dataclasses import KW_ONLY, dataclass
from types import EllipsisType
from typing import Any, Callable, Optional

from pr1.devices.claim import ClaimOwner, ClaimSymbol, PerpetualClaim
from pr1.devices.node import BaseWritableNode, NodePath
from pr1.error import Error
from pr1.fiber.eval import EvalStack
from pr1.fiber.expr import PythonExprAugmented, export_value
from pr1.fiber.parser import BlockUnitState
from pr1.fiber.process import ProgramExecEvent
from pr1.host import Host
from pr1.state import StateBaseEvent, StateInstanceNotifyCallback, StateUpdateEvent
from pr1.units.base import BaseProcessRunner, BaseRunner
from pr1.util.misc import race

from . import logger, namespace
from .parser import DevicesState


class NodeDisconnectedError(Error):
  def __init__(self, path: NodePath):
    super().__init__(
      f"Disconnected node '{'.'.join(path)}'"
    )

class NodeUnclaimableError(Error):
  def __init__(self, path: NodePath):
    super().__init__(
      f"Unclaimable node '{'.'.join(path)}'"
    )


@dataclass
class NodeStateLocation:
  value: Any
  _: KW_ONLY
  error_disconnected: bool = False
  error_evaluation: bool = False
  error_unclaimable: bool = False

  def export(self):
    return {
      "errors": {
        "disconnected": self.error_disconnected,
        "evaluation": self.error_evaluation,
        "unclaimable": self.error_unclaimable
      },
      "value": export_value(self.value)
    }

@dataclass
class StateLocation:
  values: dict[NodePath, NodeStateLocation]

  def export(self):
    return {
      "values": [
        [path, node_location.export()] for path, node_location in self.values.items()
      ]
    }

@dataclass(kw_only=True)
class StateInstanceNodeInfo:
  claim: PerpetualClaim
  node: BaseWritableNode
  path: NodePath
  task: Optional[asyncio.Task[None]]
  value: Any


class StateInstance:
  _next_index = 0

  def __init__(self, state: DevicesState, runner: 'Runner', *, notify: StateInstanceNotifyCallback, stack: EvalStack, symbol: ClaimSymbol):
    self._location: StateLocation
    self._notify = notify
    self._runner = runner
    self._stack = stack
    self._state = state
    self._symbol = symbol

    self._infos: dict[NodePath, StateInstanceNodeInfo]

    self._logger = logger.getChild(f"stateInstance{self._next_index}")
    type(self)._next_index += 1


  async def _node_lifecycle(self, info: StateInstanceNodeInfo):
    label = ".".join(info.path)

    try:
      while True:
        claim_owner = await info.claim.wait()
        self._logger.debug(f"Claimed node '{label}'")

        self._logger.debug(f"Writing node '{label}' with value {repr(info.value)}")
        await asyncio.shield(info.node.write(info.value))

        await claim_owner.lost()
        self._logger.debug(f"Lost node '{label}'")

        self._location.values[info.path].error_unclaimable = True
        self._notify(StateUpdateEvent(
          errors=[],
          location=self._location
        ))
    finally:
      info.claim.close()
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
        task=None,
        value=value
      )

      self._infos[path] = info

  def apply(self):
    self._logger.debug("Applying state")

    errors = list[Error]()

    for info in self._infos.values():
      location = NodeStateLocation(
        info.value,
        error_disconnected=(not info.node.connected),
        error_unclaimable=(not (info.claim.owner or info.claim.owned_by_child))
      )

      self._location.values[info.path] = location

      if location.error_disconnected:
        errors.append(NodeDisconnectedError(info.path))
      if location.error_unclaimable:
        errors.append(NodeUnclaimableError(info.path))

      info.task = asyncio.create_task(self._node_lifecycle(info))

    self._logger.debug("Applied state")
    return StateUpdateEvent(errors=errors, location=self._location)

  async def suspend(self):
    self._logger.debug("Suspending")

    for info in self._infos.values():
      assert info.task
      info.task.cancel()

      try:
        await info.task
      except asyncio.CancelledError:
        pass

    del self._infos
    del self._location


counter = 0

class DemoStateLocation:
  def export(self):
    return { "foo": "bar" }

class DemoStateInstance:
  _next_index = 0

  def __init__(self, state: BlockUnitState, runner: 'Runner', *, notify: Callable, stack: EvalStack, symbol: ClaimSymbol):
    global counter
    self._logger = logger.getChild(f"stateInstance{counter}")
    self._notify = notify

    self._index = self._next_index
    type(self)._next_index += 1

  def prepare(self, *, resume: bool):
    self._logger.debug(f'Prepare, resume={resume}')

  def apply(self, *, resume: bool):
    self._logger.debug(f'Apply, resume={resume}')

    async def task():
      await asyncio.sleep(0.7)
      print("Notify")
      self._notify(34)

    # if self._index == 0: asyncio.create_task(task())

    return StateUpdateEvent(DemoStateLocation(), errors=[
      Error(f"Hello {self._index}")
    ])

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

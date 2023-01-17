import asyncio
import copy
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
from pr1.state import StateEvent, StateInstanceNotifyCallback
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
  label: str
  node: BaseWritableNode
  path: NodePath
  task: Optional[asyncio.Task[None]]
  value: PythonExprAugmented
  written: bool


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
    while True:
      claim_owner = await info.claim.wait()
      self._logger.debug(f"Claimed node '{info.label}'")

      self._logger.debug(f"Writing node '{info.label}' with value {repr(info.value)}")
      await asyncio.shield(info.node.write(info.value))

      if all(info.written for info in self._infos.values()):
        self._notify(StateEvent(settled=True))

      await claim_owner.lost()
      self._logger.debug(f"Lost node '{info.label}'")

      self._location.values[info.path].error_unclaimable = True
      self._notify(StateEvent(copy.deepcopy(self._location)))

  def prepare(self, *, resume: bool):
    self._logger.debug("Preparing state")

    self._infos = dict()
    self._location = StateLocation(values=dict())

    for path, value in self._state.values.items():
      node = self._runner._host.root_node.find(path)
      assert isinstance(node, BaseWritableNode)

      info = StateInstanceNodeInfo(
        claim=node.create_claim(self._symbol),
        label=".".join(path),
        node=node,
        path=path,
        task=None,
        value=value,
        written=False
      )

      self._infos[path] = info

  def apply(self, *, resume: bool):
    self._logger.debug("Applying state")
    errors = list[Error]()

    for info in self._infos.values():
      eval_analysis, eval_result = info.value.evaluate(self._stack)

      errors += eval_analysis.errors
      eval_error = isinstance(eval_result, EllipsisType)

      location = NodeStateLocation(
        eval_result.value if not eval_error else Ellipsis,
        error_disconnected=(not info.node.connected),
        error_evaluation=eval_error,
        error_unclaimable=(not (info.claim.owner or info.claim.owned_by_child))
      )

      self._location.values[info.path] = location

      if location.error_disconnected:
        errors.append(NodeDisconnectedError(info.path))
      if location.error_unclaimable:
        errors.append(NodeUnclaimableError(info.path))

      if not eval_error:
        info.task = asyncio.create_task(self._node_lifecycle(info))

    self._logger.debug("Applied state")
    return StateEvent(copy.deepcopy(self._location), errors=errors)

  async def close(self):
    return StateEvent()

  async def suspend(self):
    self._logger.debug("Suspending")

    for info in self._infos.values():
      if info.task:
        info.task.cancel()

        try:
          await info.task
        except asyncio.CancelledError:
          pass

      info.claim.close()
      self._logger.debug(f"Released node '{info.label}'")

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
      await asyncio.sleep(0.3)

      self._notify(StateEvent(DemoStateLocation(), errors=[
        Error(f"Problem {self._index}a"),
        Error(f"Problem {self._index}b")
      ]))

    # asyncio.create_task(task())

    return StateEvent(DemoStateLocation(), errors=[
      Error(f"Hello {self._index}")
    ])

  async def close(self):
    self._logger.debug('Close')

  async def suspend(self):
    self._logger.debug('Suspend')
    # self._notify(StateEvent())

    # await asyncio.sleep(1)
    # self._notify(StateEvent(DemoStateLocation(), errors=[Error(f"Suspend {self._index}")]))

    # await asyncio.sleep(0.6)

    return StateEvent(DemoStateLocation(), errors=[Error(f"Suspend {self._index}")])


class Runner(BaseRunner):
  StateInstance = StateInstance

  def __init__(self, chip, *, host: Host):
    self._chip = chip
    self._host = host

  def transfer_state(self):
    logger.debug('Transfering claims')
    self._host.root_node.transfer_claims()

  def write_state(self):
    logger.debug('Write state')

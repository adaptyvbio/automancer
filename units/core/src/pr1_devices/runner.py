import asyncio
import bisect
from asyncio import Event, Task
from dataclasses import KW_ONLY, dataclass, field
from logging import Logger
from types import EllipsisType
from typing import Any, Callable, Optional, Self

from pr1.devices.claim import Claim
from pr1.devices.nodes.numeric import NumericNode
from pr1.devices.nodes.common import BaseNode, NodePath
from pr1.devices.nodes.primitive import BooleanNode, EnumNode
from pr1.devices.nodes.value import Null, ValueNode
from pr1.error import Error
from pr1.fiber.eval import EvalContext
from pr1.fiber.expr import export_value
from pr1.fiber.master2 import Master
from pr1.host import Host
from pr1.master.analysis import MasterAnalysis, MasterError
from pr1.state import StateEvent, StateProgramItem, UnitStateManager
from pr1.units.base import BaseRunner
from pr1.util.asyncio import race, run_anonymous, wait_all
from pr1.util.decorators import provide_logger

from . import logger
from .program import PublisherProgram


PublisherTrace = tuple[PublisherProgram, ...]

@dataclass
class Declaration:
  assignments: dict[ValueNode, Any]
  trace: PublisherTrace
  active: bool = True
  stable: bool = False

  def __lt__(self, other: Self):
    return len(self.trace) > len(other.trace)


@dataclass
class NodeInfo:
  candidate_count: int = 0
  claim: Optional[Claim] = None
  current_declaration: Optional[Declaration] = None
  settle_event: Event = field(default_factory=Event)
  update_event: Event = field(default_factory=Event)
  worker_task: Optional[Task[None]] = None


@provide_logger(logger)
class Runner(BaseRunner):
  def __init__(self, chip, *, host: Host):
    self._chip = chip
    self._host = host

    self._declarations = list[Declaration]()
    self._node_infos = dict[ValueNode, NodeInfo]()

    self._logger: Logger
    self._master: Master

  def add(self, trace: PublisherTrace, assignments: dict[ValueNode, Any]):
    declaration = Declaration(assignments, trace)
    bisect.insort(self._declarations, declaration)

    for node, value in assignments.items():
      if not node in self._node_infos:
        self._node_infos[node] = NodeInfo()

      self._node_infos[node].candidate_count += 1

    return declaration

  def remove(self, declaration: Declaration):
    self._declarations.remove(declaration)

    for node in declaration.assignments.keys():
      node_info = self._node_infos[node]
      node_info.candidate_count -= 1

      if node_info.candidate_count < 1:
        del self._node_infos[node]

        if node_info.worker_task:
          node_info.worker_task.cancel()


  def update(self):
    for node, node_info in self._node_infos.items():
      node_declaration = next((declaration for declaration in self._declarations if declaration.active and (node in declaration.assignments)), None)

      if node_info.current_declaration is not node_declaration:
        node_info.current_declaration = node_declaration
        node_info.update_event.set()

      if not node_info.worker_task:
        node_info.worker_task = self._master.pool.start_soon(self._node_worker(node, node_info))

  async def wait(self):
    for node_info in self._node_infos.values():
      await node_info.settle_event.wait()


  async def _node_worker(self, node: ValueNode, node_info: NodeInfo):
    self._logger.debug(f"Launching worker of node with id '{node.id}'")

    node_info.claim = node.claim()

    try:
      while True:
        await node_info.claim.wait()
        # info.current_candidate.item_info.notify(NodeStateLocation(info.current_candidate.value))

        while True:
          await node_info.update_event.wait()
          node_info.update_event.clear()

          if node_info.current_declaration:
            assignment_value = node_info.current_declaration.assignments[node]
            value = assignment_value if (assignment_value is not None) else Null
          else:
            value = None

          node.writer.set(value)

          await node.writer.wait_settled()
          node_info.settle_event.set()
    finally:
      node_info.claim.destroy()
      node_info.claim = None

      self._logger.debug(f"Removing worker of node with id '{node.id}'")

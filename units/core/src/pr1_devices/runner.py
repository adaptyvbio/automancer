import asyncio
import bisect
from asyncio import Event, Task
from dataclasses import KW_ONLY, dataclass, field
from types import EllipsisType
from typing import Any, Callable, Optional

from pr1.devices.claim import Claim
from pr1.devices.nodes.numeric import NumericNode
from pr1.devices.nodes.common import NodePath
from pr1.devices.nodes.primitive import BooleanNode, EnumNode
from pr1.devices.nodes.value import Null, ValueNode
from pr1.error import Error
from pr1.fiber.eval import EvalContext
from pr1.fiber.expr import export_value
from pr1.host import Host
from pr1.master.analysis import MasterAnalysis
from pr1.state import StateEvent, StateProgramItem, UnitStateManager
from pr1.units.base import BaseRunner
from pr1.util.asyncio import cancel_task, run_anonymous
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
class DevicesStateItemLocation:
  values: dict[NodePath, NodeStateLocation] = field(default_factory=dict)

  def export(self):
    return {
      "values": [
        [path, node_location.export()] for path, node_location in self.values.items()
      ]
    }

@dataclass
class DevicesStateItemInfo:
  item: StateProgramItem
  location: DevicesStateItemLocation = field(default_factory=DevicesStateItemLocation, init=False)
  nodes: set[ValueNode] = field(default_factory=set, init=False)
  notify: Callable[[StateEvent], None] = field(kw_only=True)

  def __hash__(self):
    return id(self)

  def do_notify(self, manager: 'DevicesStateManager'):
    self.notify(StateEvent(self.location, settled=self.is_settled(manager)))

  def is_settled(self, manager: 'DevicesStateManager'):
    return all(node_info.settled for node in self.nodes if (node_info := manager._node_infos[node]).current_candidate and (node_info.current_candidate.item_info is self)) # type: ignore

@dataclass
class DevicesStateNodeCandidate:
  item_info: DevicesStateItemInfo
  value: Any

@dataclass(kw_only=True)
class DevicesStateNodeInfo:
  candidates: list[DevicesStateNodeCandidate] = field(default_factory=list)
  claim: Optional[Claim] = None
  current_candidate: Optional[DevicesStateNodeCandidate] = None
  path: NodePath
  settled: bool = False
  task: Optional[Task] = None
  update_event: Optional[Event] = None

class DevicesStateManager(UnitStateManager):
  def __init__(self, runner: 'DevicesRunner'):
    self._item_infos = dict[StateProgramItem, DevicesStateItemInfo]()
    self._node_infos = dict[ValueNode, DevicesStateNodeInfo]()
    self._runner = runner
    self._updated_nodes = set[ValueNode]()

  async def _node_lifecycle(self, node: ValueNode, node_info: DevicesStateNodeInfo):
    assert node_info.claim
    assert node_info.update_event

    def listener():
      pass

    reg = node.watch_connection(listener)

    try:
      while True:
        await node_info.claim.wait()
        # info.current_candidate.item_info.notify(NodeStateLocation(info.current_candidate.value))

        while True:
          if node_info.current_candidate:
            value = node_info.current_candidate.value

            match node:
              case BooleanNode():
                await node.write(value if value is not None else Null)
              case EnumNode():
                await node.write(value if value is not None else Null)
              case NumericNode():
                await node.write(value if value is not None else Null)
              case _:
                raise ValueError

            # TODO: node_info.current_candidate could have changed here

            node_info.settled = True
            node_info.current_candidate.item_info.do_notify(self)

          race_index, _ = await race(node_info.claim.lost(), node_info.update_event.wait())

          if race_index == 0:
            # The claim was lost.
            # node_info.current_candidate.item_info.notify(NodeStateLocation(node_info.current_candidate.value, error_unclaimable=True))
            break
          else:
            # The node was updated.
            node_info.update_event.clear()
    except asyncio.CancelledError:
      pass
    finally:
      if reg:
        await reg.cancel()

      node_info.claim.destroy()

  def add(self, item, state: Optional[DevicesState], *, notify, stack):
    analysis = MasterAnalysis()

    item_info = DevicesStateItemInfo(item, notify=notify)
    self._item_infos[item] = item_info

    if state:
      for node_path, node_value in state.values.items():
        node = self._runner._host.root_node.find(node_path)
        assert isinstance(node, ValueNode)
        item_info.nodes.add(node)

        value_result = analysis.add(node_value.eval(EvalContext(stack), final=True))

        if isinstance(value_result, EllipsisType):
          return analysis, Ellipsis

        if node in self._node_infos:
          node_info = self._node_infos[node]
        else:
          node_info = DevicesStateNodeInfo(path=node_path)
          self._node_infos[node] = node_info

        item_info.location.values[node_info.path] = NodeStateLocation(value_result.value)
        bisect.insort_left(node_info.candidates, DevicesStateNodeCandidate(item_info, value_result.value), key=(lambda candidate: candidate.item_info.item))

    return analysis, None

  async def remove(self, item):
    nodes = self._item_infos[item].nodes

    for node in nodes:
      # Nodes that had an invalid value will be missing from self._node_infos.
      node_info = self._node_infos.get(node)

      if node_info:
        node_info.candidates = [candidate for candidate in node_info.candidates if candidate.item_info.item is not item]

        if node_info.current_candidate and (node_info.current_candidate.item_info.item is item):
          node_info.current_candidate = None

    del self._item_infos[item]

  async def apply(self, items):
    obsolete_nodes = set[ValueNode]()

    for item in items:
      self._updated_nodes |= self._item_infos[item].nodes

    for node in self._updated_nodes:
      # TODO: Discriminate across branches

      node_info = self._node_infos[node]
      new_candidate = next((candidate for candidate in node_info.candidates[::-1] if (candidate_item := candidate.item_info.item).applied or (candidate_item in items)), None)

      # print('New candidate', node_info.current_candidate is not None, new_candidate is not None, node_info.current_candidate is not new_candidate)

      if node_info.current_candidate is not new_candidate:
        if node_info.current_candidate:
          current_item_info = node_info.current_candidate.item_info
          current_node_location = current_item_info.location.values[node_info.path]
          current_node_new_location = NodeStateLocation(current_node_location.value)

          if current_node_new_location != current_node_location:
            current_item_info.location.values[node_info.path] = current_node_new_location
            current_item_info.do_notify(self)

        node_info.current_candidate = new_candidate

        if new_candidate:
          node_info.settled = False

          if node_info.update_event:
            node_info.update_event.set()

          new_candidate.item_info.do_notify(self)

          if not node_info.claim:
            node_info.claim = node.claim()

          if not node_info.task:
            node_info.task = run_anonymous(self._node_lifecycle(node, node_info))
            node_info.update_event = Event()

      if not node_info.candidates:
        obsolete_nodes.add(node)

    self._updated_nodes.clear()

    for item in items:
      item_info = self._item_infos[item]
      item_info.do_notify(self)

    for node in obsolete_nodes:
      node_info = self._node_infos[node]

      assert node_info.task
      await cancel_task(node_info.task)
      node_info.task.cancel()
      node_info.task = None

      del self._node_infos[node]

  async def clear(self, item):
    await self.apply(list())

  async def suspend(self, item):
    self._updated_nodes |= self._item_infos[item].nodes

    return StateEvent(DevicesStateItemLocation({}))


class DevicesRunner(BaseRunner):
  StateConsumer = DevicesStateManager

  def __init__(self, chip, *, host: Host):
    self._chip = chip
    self._host = host

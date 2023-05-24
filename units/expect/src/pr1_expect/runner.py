import asyncio
from asyncio import Task
from dataclasses import dataclass, field
from types import EllipsisType
from typing import Literal, Optional, cast

from pr1.devices.nodes.readable import WatchableNode
from pr1.error import Diagnostic
from pr1.fiber.eval import EvalContext
from pr1.fiber.expr import Evaluable, PythonExprObject
from pr1.master.analysis import MasterAnalysis
from pr1.reader import LocatedString
from pr1.state import StateEvent, UnitStateInstance
from pr1.units.base import BaseProcessRunner
from pr1.util.asyncio import AsyncCancelable, cancel_task
from pr1.util.misc import Exportable
from pr1.util.pool import Pool

from .parser import StateData


class ExpectError(Diagnostic):
  def __init__(self, message: str):
    super().__init__(message)


@dataclass(kw_only=True)
class EntryInfo:
  dependencies: set[tuple[WatchableNode, Literal['connected', 'value']]] = field(default_factory=set)
  expr_object: PythonExprObject
  falsy: bool = False
  initialization_task: Optional[Task] = None
  message: Optional[Evaluable[LocatedString]]
  registration: Optional[AsyncCancelable] = None
  warning: bool

@dataclass(kw_only=True)
class StateLocation(Exportable):
  def export(self):
    return dict()

class StateInstance(UnitStateInstance):
  def __init__(self, runner: 'Runner', *, item, notify, stack):
    self._item = item
    self._notify = notify
    self._runner = runner
    self._stack = stack

    self._entry_infos = list[EntryInfo]()
    self._pool = Pool(open=True)

  def prepare(self, state: StateData):
    analysis = MasterAnalysis()

    for entry in state.entries:
      expr_object = entry['condition']

      entry_info = EntryInfo(
        expr_object=expr_object,
        message=entry.get('message'),
        warning=(('effect' in entry) and (entry['effect'].value == 'warning'))
      )

      self._entry_infos.append(entry_info)

      dependencies = cast(set, expr_object.metadata.get('devices.dependencies')) or set()

      for dependency in dependencies:
        node = self._runner._host.root_node.find(dependency.path)

        if isinstance(node, WatchableNode):
          entry_info.dependencies.add((node, dependency.endpoint))

    return analysis, None

  def apply(self):
    self._notify(StateEvent(StateLocation(), settled=False))
    self._pool.start_soon(self._initialize())

  def _check_entry(self, entry_info: EntryInfo):
    analysis, result = entry_info.expr_object.eval(EvalContext(stack=self._stack), final=True)

    if isinstance(result, EllipsisType):
      failure = True
    elif (not result.value) and (not entry_info.falsy):
      entry_info.falsy = True

      if entry_info.message:
        message_result = analysis.add(entry_info.message.eval(EvalContext(stack=self._stack), final=True))

        if not isinstance(message_result, EllipsisType):
          message = message_result.value
        else:
          message = "Expected true value - Failed to obtain message"
      else:
        message = "Expected true value"

      if entry_info.warning:
        analysis.warnings.append(ExpectError(message))
        failure = False
      else:
        analysis.errors.append(ExpectError(message))
        failure = True
    else:
      failure = False
      entry_info.falsy = (not result.value)

    analysis = MasterAnalysis.cast(analysis)

    if not analysis.empty:
      self._notify(StateEvent(
        analysis=analysis,
        settled=True
      ))

    if failure:
      self._item.handle.pause_unstable_parent_of_children()

  async def _initialize(self):
    for entry_info in self._entry_infos:
      entry_info.initialization_task = asyncio.create_task(self._initialize_entry(entry_info))

    await asyncio.gather(*[entry_info.initialization_task for entry_info in self._entry_infos if entry_info.initialization_task])

    self._notify(StateEvent(StateLocation(), settled=True))

  async def _initialize_entry(self, entry_info: EntryInfo):
    listener = lambda nodes: self._check_entry(entry_info)
    entry_info.registration = await asyncio.create_task(WatchableNode.watch_values([node for node, endpoint in entry_info.dependencies], listener))

    self._check_entry(entry_info)

  async def _deinitialize(self):
    for entry_info in self._entry_infos:
      await cancel_task(entry_info.initialization_task)
      entry_info.initialization_task = None

      if entry_info.registration:
        await entry_info.registration.cancel()
        entry_info.registration = None

  async def close(self):
    await self._pool.wait()

  async def suspend(self):
    await self._deinitialize()
    self._notify(StateEvent(StateLocation(), settled=False))


class Runner(BaseProcessRunner):
  StateConsumer = StateInstance

  def __init__(self, *, chip, host):
    self._chip = chip
    self._host = host

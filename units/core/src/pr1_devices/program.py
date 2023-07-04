import asyncio
from asyncio import Event, Task
from dataclasses import dataclass, field
from logging import Logger
from types import EllipsisType
from typing import (TYPE_CHECKING, Any, AsyncIterator, Never, Optional, cast,
                    final)

import automancer as am
import comserde

from . import logger, namespace
from .parser import ApplierBlock, PublisherBlock

if TYPE_CHECKING:
  from .runner import Declaration


ValueNodeValue = am.NullType | object


class PublisherProgramMode:
  @dataclass(frozen=True, slots=True)
  class Collecting:
    task: Task[object] = field(repr=False)

    def location(self):
      return PublisherProgramMode.CollectingLocation()

  @comserde.serializable
  @dataclass(frozen=True, slots=True)
  class CollectingLocation:
    def export(self):
      return {
        "type": "collecting"
      }

  @dataclass(frozen=True, slots=True)
  class Failed:
    event: Event = field(default_factory=Event, init=False, repr=False)

    def location(self):
      return PublisherProgramMode.FailedLocation()

  @comserde.serializable
  @dataclass(frozen=True, slots=True)
  class FailedLocation:
    def export(self):
      return {
        "type": "failed"
      }

  @dataclass(frozen=True, slots=True)
  class Halting:
    def location(self):
      return PublisherProgramMode.HaltingLocation()

  @comserde.serializable
  @dataclass(frozen=True, slots=True)
  class HaltingLocation:
    def export(self):
      return {
        "type": "halting"
      }

  @dataclass(frozen=True, slots=True)
  class Normal:
    declaration: 'Declaration'
    owner: am.ProgramOwner = field(repr=False)

    def location(self):
      return PublisherProgramMode.NormalLocation(active=self.declaration.active)

  @comserde.serializable
  @dataclass(frozen=True, slots=True)
  class NormalLocation:
    active: bool

    def export(self):
      return {
        "type": "normal",
        "active": self.active
      }

  Any = Collecting | Failed | Halting | Normal
  AnyLocation = CollectingLocation | FailedLocation | HaltingLocation | NormalLocation


@dataclass
class PublisherProgramLocation(am.BaseProgramLocation):
  assignments: dict[am.NodePath, Optional[am.NullType | object]] # None = Failed to obtain value
  mode: PublisherProgramMode.AnyLocation

  def export(self, context):
    return {
      "assignments": [[path, cast(am.ValueNode, context.host.root_node.find(path)).export_value(value)] for path, value in self.assignments.items()],
      "mode": self.mode.export()
    }

@final
class PublisherProgram(am.BaseProgram):
  def __init__(self, block: PublisherBlock, handle):
    from .runner import Runner

    super().__init__(block, handle)

    self._block = block
    self._handle = handle
    self._runner = cast(Runner, handle.master.runners[namespace])

    self._assignments: dict[am.NodePath, tuple[am.ValueNode, Optional[ValueNodeValue]]]
    self._mode: PublisherProgramMode.Any

  def _send_location(self):
    self._handle.send_location(PublisherProgramLocation({ path: value for path, (node, value) in self._assignments.items() }, self._mode.location()))

  def halt(self):
    match self._mode:
      case PublisherProgramMode.Collecting(task=task):
        task.cancel()
        self._mode = PublisherProgramMode.Halting()
      case PublisherProgramMode.Failed(event=event):
        event.set()
      case PublisherProgramMode.Normal(owner=owner):
        owner.halt()

    self._mode = PublisherProgramMode.Halting()

  def receive(self, message, /):
    match message["type"]:
      case "activate":
        self.activate()
      case "deactivate":
        self.deactivate()
      case _:
        super().receive(message)

  def activate(self):
    match self._mode:
      case PublisherProgramMode.Normal(declaration) if not declaration.active:
        declaration.active = True
        self._runner.update()
        self._send_location()

  def deactivate(self):
    match self._mode:
      case PublisherProgramMode.Normal(declaration) if declaration.active:
        declaration.active = False
        self._runner.update()
        self._send_location()

  async def run(self, point: Optional[Never], stack):
    trace = self._handle.ancestors(include_self=True, type=PublisherProgram)

    self._assignments = dict()

    async def collect():
      analysis = am.LanguageServiceAnalysis()
      node_watchers = dict[am.NodePath, Optional[Any]]()

      for path, evaluable_value in self._block.assignments.items():
        result = analysis.add(await evaluable_value.evaluate_final_async(self._handle.context))

        node = self._runner._master.host.root_node.find(path)
        assert isinstance(node, am.ValueNode)

        if not isinstance(result, EllipsisType):
          watcher = aiter(result.value.watch(self._handle.context))
          watcher_initial = await anext(watcher)
          node_value = analysis.add(watcher_initial)

          self._assignments[path] = node, (node_value if not isinstance(node_value, EllipsisType) else None)
          node_watchers[path] = watcher
        else:
          self._assignments[path] = node, None
          node_watchers[path] = None

      self._handle.send_analysis(analysis)

      return node_watchers

    task = asyncio.create_task(collect())
    self._mode = PublisherProgramMode.Collecting(task)
    self._send_location()

    try:
      node_watchers = await task
    except asyncio.CancelledError:
      return

    failure = any(value is None for value in self._assignments.values())

    if failure:
      self._mode = PublisherProgramMode.Failed()
      self._send_location()

      await self._mode.event.wait()
    else:
      declaration = self._runner.add(tuple(trace), { node: value for node, value in self._assignments.values() })

      async def handle_watcher(path: am.NodePath, node: am.ValueNode, node_watcher: AsyncIterator[tuple[am.BaseAnalysis, am.NullType | object | EllipsisType]]):
        async for analysis, node_value in aiter(node_watcher):
          declaration.assignments[node] = node_value if not isinstance(node_value, EllipsisType) else None

          self._handle.send_analysis(analysis)
          self._runner.update()

      async with am.Pool.open() as pool:
        # for path, node_watcher in node_watchers.items():
        #   assert node_watcher

        #   node, _ = self._assignments[path]
        #   pool.start_soon(handle_watcher(path, node, node_watcher))

        owner = self._handle.create_child(self._block.child)
        self._mode = PublisherProgramMode.Normal(declaration, owner)
        self._send_location()

        await owner.run(point, stack)
        self._runner.remove(declaration)


    del self._assignments
    del self._mode


class ApplierProgramMode:
  @dataclass(frozen=True, slots=True)
  class Applying:
    task: Task[None] = field(repr=False)

    def location(self):
      return ApplierProgramMode.ApplyingLocation()

  @comserde.serializable
  @dataclass(frozen=True, slots=True)
  class ApplyingLocation:
    def export(self):
      return "applying"

  @dataclass(frozen=True, slots=True)
  class Halting:
    def location(self):
      return ApplierProgramMode.HaltingLocation()

  @comserde.serializable
  @dataclass(frozen=True, slots=True)
  class HaltingLocation:
    def export(self):
      return "halting"

  @dataclass(frozen=True, slots=True)
  class Normal:
    owner: am.ProgramOwner = field(repr=False)

    def location(self):
      return ApplierProgramMode.NormalLocation()

  @comserde.serializable
  @dataclass(frozen=True, slots=True)
  class NormalLocation:
    def export(self):
      return "normal"

  Any = Applying | Halting | Normal
  AnyLocation = ApplyingLocation | HaltingLocation | NormalLocation

@dataclass
class ApplierProgramLocation(am.BaseProgramLocation):
  mode: ApplierProgramMode.AnyLocation

  def export(self, context):
    return {
      "mode": self.mode.export()
    }


@final
@am.provide_logger(logger)
class ApplierProgram(am.BaseProgram):
  def __init__(self, block: ApplierBlock, handle: am.ProgramHandle):
    from .runner import Runner

    super().__init__(block, handle)

    self._block = block
    self._handle = handle
    self._runner = cast(Runner, handle.master.runners[namespace])

    self._logger: Logger
    self._mode: ApplierProgramMode.Any

  def _send_location(self):
    self._handle.send_location(ApplierProgramLocation(self._mode.location()))

  def halt(self):
    match self._mode:
      case ApplierProgramMode.Applying(task):
        task.cancel()
      case ApplierProgramMode.Halting():
        return
      case ApplierProgramMode.Normal(owner):
        owner.halt()

    self._mode = ApplierProgramMode.Halting()
    self._send_location()

  def term_info(self, children_terms):
    if not (0 in children_terms):
      return self._block.duration(), { 0: am.DurationTerm.zero() }

    return children_terms[0], dict()

  async def run(self, point, stack):
    self._logger.debug("Applying")

    self._runner.apply()
    apply_task = asyncio.create_task(self._runner.wait())

    self._mode = ApplierProgramMode.Applying(apply_task)
    self._send_location()

    try:
      await apply_task
    except asyncio.CancelledError:
      return
    else:
      self._logger.debug("Applied")

    owner = self._handle.create_child(self._block.child)
    self._mode = ApplierProgramMode.Normal(owner)
    self._send_location()

    await owner.run(point, stack)

    del self._mode

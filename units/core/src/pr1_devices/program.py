from asyncio import Event, Task
import asyncio
from dataclasses import dataclass, field
from logging import Logger
from types import EllipsisType
from typing import TYPE_CHECKING, Any, Optional, cast, final

from pr1.devices.nodes.common import NodePath
from pr1.fiber.expr import export_value
from pr1.master.analysis import MasterAnalysis
from pr1.fiber.process import ProgramExecEvent
from pr1.util.decorators import provide_logger
from pr1.util.misc import Exportable
from pr1.devices.nodes.value import ValueNode
from pr1.fiber.eval import EvalContext
from pr1.fiber.langservice import Analysis
from pr1.fiber.master2 import ProgramHandle, ProgramOwner
from pr1.fiber.parser import BaseProgram, BaseProgramPoint

from . import logger, namespace
from .parser import ApplierBlock, PublisherBlock

if TYPE_CHECKING:
  from .runner import Declaration


class PublisherProgramMode:
  @dataclass
  class Failed:
    event: Event = field(default_factory=Event, repr=False)

    def export(self):
      return {
        "type": "failed"
      }

  @dataclass
  class Halting:
    def export(self):
      return {
        "type": "halting"
      }

  @dataclass
  class Normal:
    declaration: 'Declaration'
    owner: ProgramOwner = field(repr=False)

    def export(self):
      return {
        "type": "normal",
        "active": self.declaration.active
      }

  Any = Failed | Halting | Normal


@dataclass
class PublisherProgramLocation(Exportable):
  assignments: dict[NodePath, Optional[Any]]
  mode: PublisherProgramMode.Any

  def export(self):
    return {
      "assignments": [[path, export_value(value)] for path, value in self.assignments.items()],
      "mode": self.mode.export()
    }

@final
class PublisherProgramPoint(BaseProgramPoint):
  pass

@final
class PublisherProgram(BaseProgram):
  def __init__(self, block: PublisherBlock, handle):
    from .runner import Runner

    super().__init__(block, handle)

    self._block = block
    self._handle = handle
    self._runner = cast(Runner, handle.master.chip.runners[namespace])

    self._assignments: dict[NodePath, Optional[Any]]
    self._mode: PublisherProgramMode.Any

  def halt(self):
    match self._mode:
      case PublisherProgramMode.Failed(event=event):
        event.set()
      case PublisherProgramMode.Normal(owner=owner):
        owner.halt()

    self._mode = PublisherProgramMode.Halting()

  def receive(self, message, /):
    match message["type"]:
      case "apply":
        self.apply()
      case "suspend":
        self.suspend()
      case _:
        super().receive(message)

  def apply(self):
    match self._mode:
      case PublisherProgramMode.Normal(declaration) if not declaration.active:
        declaration.active = True
        self._runner.update()

        self._handle.send(ProgramExecEvent(
          location=PublisherProgramLocation(self._assignments, self._mode)
        ))

  def suspend(self):
    match self._mode:
      case PublisherProgramMode.Normal(declaration) if declaration.active:
        declaration.active = False
        self._runner.update()

        self._handle.send(ProgramExecEvent(
          location=PublisherProgramLocation(self._assignments, self._mode)
        ))

  async def run(self, point: Optional[PublisherProgramPoint], stack):
    trace = cast(list[PublisherProgram], self._handle.ancestors(include_self=True))

    analysis = Analysis()
    assignments = dict[ValueNode, Any]()
    location_assignments = dict[NodePath, Optional[Any]]()
    failure = False

    for path, evaluable_value in self._block.assignments.items():
      result = analysis.add(evaluable_value.eval(EvalContext(stack), final=True))

      node = self._runner._host.root_node.find(path)
      assert isinstance(node, ValueNode)

      if not isinstance(result, EllipsisType):
        assignments[node] = result.value
        location_assignments[path] = result.value
      else:
        failure = True
        location_assignments[path] = None

    self._assignments = location_assignments

    if failure:
      self._mode = PublisherProgramMode.Failed()
      self._handle.send(ProgramExecEvent(
        analysis=MasterAnalysis.cast(analysis),
        location=PublisherProgramLocation(self._assignments, self._mode)
      ))

      await self._mode.event.wait()
    else:
      declaration = self._runner.add(tuple(trace), assignments)

      owner = self._handle.create_child(self._block.child)
      self._mode = PublisherProgramMode.Normal(declaration, owner)

      self._handle.send(ProgramExecEvent(
        analysis=MasterAnalysis.cast(analysis),
        location=PublisherProgramLocation(self._assignments, self._mode)
      ))

      await owner.run(point, stack)
      self._runner.remove(declaration)

    del self._assignments
    del self._mode


class ApplierProgramMode:
  @dataclass
  class Applying:
    task: Task[None] = field(repr=False)

    def export(self):
      return 0

  @dataclass
  class Halting:
    def export(self):
      return 2

  @dataclass
  class Normal:
    owner: ProgramOwner = field(repr=False)

    def export(self):
      return 1

  Any = Applying | Halting | Normal

@dataclass
class ApplierProgramLocation(Exportable):
  mode: ApplierProgramMode.Any

  def export(self):
    return {
      "mode": self.mode.export()
    }


@final
@provide_logger(logger)
class ApplierProgram(BaseProgram):
  def __init__(self, block: ApplierBlock, handle: ProgramHandle):
    from .runner import Runner

    super().__init__(block, handle)

    self._block = block
    self._handle = handle
    self._runner = cast(Runner, handle.master.chip.runners[namespace])

    self._logger: Logger
    self._mode: ApplierProgramMode.Any

  def halt(self):
    match self._mode:
      case ApplierProgramMode.Applying(task):
        task.cancel()
      case ApplierProgramMode.Normal(owner):
        owner.halt()

  async def run(self, point, stack):
    self._logger.debug("Applying")

    self._runner._master = self._handle.master
    self._runner.update()

    apply_task = asyncio.create_task(self._runner.wait())

    self._mode = ApplierProgramMode.Applying(apply_task)
    self._handle.send(ProgramExecEvent(location=ApplierProgramLocation(self._mode)))

    try:
      await apply_task
    except asyncio.CancelledError:
      return
    else:
      self._logger.debug("Applied")

      owner = self._handle.create_child(self._block.child)
      self._mode = ApplierProgramMode.Normal(owner)
      self._handle.send(ProgramExecEvent(location=ApplierProgramLocation(self._mode)))

      await owner.run(point, stack)

    del self._mode

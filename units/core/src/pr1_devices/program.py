from asyncio import Event
from dataclasses import dataclass, field
from types import EllipsisType
from typing import Any, Optional, Self, cast, final

from pr1.devices.nodes.common import BaseNode, NodePath
from pr1.master.analysis import MasterAnalysis
from pr1.fiber.process import ProgramExecEvent
from pr1.util.misc import Exportable
from pr1.devices.nodes.value import ValueNode
from pr1.fiber.eval import EvalContext
from pr1.fiber.langservice import Analysis
from pr1.fiber.master2 import Master, ProgramHandle, ProgramOwner
from pr1.fiber.parser import BaseBlock, BaseProgram, BaseProgramPoint

from . import namespace
from .parser import PublisherBlock


class PublisherProgramMode:
  @dataclass
  class Failed:
    event: Event = field(default_factory=Event)

    def export(self):
      return 1

  @dataclass
  class Halting:
    def export(self):
      return 2

  @dataclass
  class Normal:
    owner: ProgramOwner

    def export(self):
      return 0

  Any = Failed | Halting | Normal


@dataclass
class PublisherProgramLocation(Exportable):
  assignments: dict[NodePath, Optional[Any]]
  mode: PublisherProgramMode.Any

  def export(self):
    return {
      "assignments": [[path, value] for path, value in self.assignments.items()],
      "mode": self.mode.export()
    }

@final
class PublisherProgramPoint(BaseProgramPoint):
  pass

@final
class PublisherProgram(BaseProgram):
  def __init__(self, block: PublisherBlock, handle: ProgramHandle):
    from .runner import Runner

    self._block = block
    self._handle = handle
    self._runner = cast(Runner, handle.master.chip.runners[namespace])

    self._mode: PublisherProgramMode.Any

  def halt(self):
    match self._mode:
      case PublisherProgramMode.Failed(event):
        event.set()
      case PublisherProgramMode.Normal(owner):
        owner.halt()

    self._mode = PublisherProgramMode.Halting()

  async def run(self, point: PublisherProgramPoint, stack):
    # if isinstance(parent, Self):  ????

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

    if failure:
      self._mode = PublisherProgramMode.Failed()
      self._handle.send(ProgramExecEvent(
        analysis=MasterAnalysis.cast(analysis),
        location=PublisherProgramLocation(location_assignments, self._mode)
      ))

      await self._mode.event.wait()
    else:
      declaration = self._runner.add(tuple(trace), assignments)

      owner = self._handle.create_child(self._block.child)
      self._mode = PublisherProgramMode.Normal(owner)

      await owner.run(point, stack)
      self._runner.remove(declaration)

    del self._mode


@dataclass
@final
class ApplierBlock(BaseBlock):
  child: BaseBlock

@final
class ApplierProgram(BaseProgram):
  def __init__(self, block: ApplierBlock, handle: ProgramHandle):
    from .runner import Runner

    self._block = block
    self._handle = handle
    self._runner = cast(Runner, handle.master.chip.runners[namespace])

    self._owner: ProgramOwner

  def halt(self):
    self._owner.halt()

  def receive(self, message, /):
    match message:
      case "pause":
        pass
      case "resume":
        pass

  async def run(self, point, stack):
    owner = self._handle.create_child(self._block.child)

    self._runner.apply()

    await self._runner.wait()

    await owner.run(point, stack)
    del owner

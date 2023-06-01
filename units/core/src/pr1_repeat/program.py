from asyncio import Event
from dataclasses import KW_ONLY, dataclass, field
from types import EllipsisType
from typing import Optional

from pr1.fiber.eval import EvalContext, EvalStack
from pr1.fiber.master2 import ProgramOwner
from pr1.fiber.parser import BaseProgram, BaseProgramPoint
from pr1.fiber.process import ProgramExecEvent
from pr1.master.analysis import MasterAnalysis

from .parser import Block


class ProgramMode:
  @dataclass
  class Failed:
    event: Event = field(default_factory=Event)

    def export(self):
      return 0

  @dataclass
  class Halting:
    def export(self):
      return 1

  @dataclass
  class Normal:
    owner: ProgramOwner = field(repr=False)

    def export(self):
      return 2

  Any = Failed | Halting | Normal


@dataclass
class ProgramLocation:
  mode: ProgramMode.Any
  _: KW_ONLY
  count: Optional[int] = None
  iteration: Optional[int] = None

  def export(self):
    return {
      "count": self.count,
      "iteration": self.iteration,
      "mode": self.mode.export()
    }

@dataclass(kw_only=True)
class ProgramPoint:
  child: Optional[BaseProgramPoint]
  iteration: int


class Program(BaseProgram):
  def __init__(self, block: Block, handle):
    super().__init__(block, handle)

    self._block = block
    self._handle = handle

    self._iteration: int
    self._mode: ProgramMode.Any
    self._point: Optional[ProgramPoint]

  def halt(self):
    match self._mode:
      case ProgramMode.Failed(event):
        event.set()
      case ProgramMode.Normal(owner):
        owner.halt()

    self._mode = ProgramMode.Halting()

  # def jump(self, point: RepeatProgramPoint):
  #   if point.iteration != self._iteration:
  #     self._point = point
  #     self.halt()
  #   elif point.child:
  #     self._child_program.jump(point.child)

  async def run(self, point: Optional[ProgramPoint], stack):
    while True:
      analysis, result = self._block.count.evaluate_final(EvalContext(stack))

      if not isinstance(result, EllipsisType):
        break

      self._mode = ProgramMode.Failed()

      self._handle.send(ProgramExecEvent(
        analysis=MasterAnalysis.cast(analysis),
        location=ProgramLocation(self._mode)
      ))

      await self._mode.event.wait()

      if isinstance(self._mode, ProgramMode.Halting):
        return

    iteration_count = result.value if (result.value != 'forever') else None

    self._handle.send(ProgramExecEvent(
      analysis=MasterAnalysis.cast(analysis)
    ))

    self._point = point or ProgramPoint(child=None, iteration=0)

    while True:
      current_point = self._point

      self._iteration = current_point.iteration
      self._point = None

      if (iteration_count is not None) and (self._iteration >= iteration_count):
        break

      owner = self._handle.create_child(self._block.block)
      self._mode = ProgramMode.Normal(owner)

      self._handle.send(ProgramExecEvent(location=ProgramLocation(
        self._mode,
        count=iteration_count,
        iteration=self._iteration
      )))

      child_stack: EvalStack = {
        **stack,
        self._block.env: { 'index': self._iteration }
      }

      await owner.run(current_point.child, child_stack)

      if self._point:
        pass
      elif isinstance(self._mode, ProgramMode.Halting) or ((iteration_count is not None) and ((self._iteration + 1) >= iteration_count)):
        break

      self._point = ProgramPoint(child=None, iteration=(self._iteration + 1))
      self._handle.collect_children()

      # await self._handle.resume_parent()

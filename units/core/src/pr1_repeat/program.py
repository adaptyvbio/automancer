from asyncio import Event
from dataclasses import KW_ONLY, dataclass, field
from genericpath import isfile
import math
from types import EllipsisType
from typing import Optional

import automancer as am
from pr1.fiber.eval import EvalContext, EvalStack
from pr1.fiber.master2 import ProgramOwner
from pr1.fiber.parser import BaseProgram, BaseProgramPoint

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
class ProgramLocation(am.BaseProgramLocation):
  mode: int
  _: KW_ONLY
  count: Optional[int] = None
  iteration: Optional[int] = None

  def export(self, context):
    return {
      "count": self.count,
      "iteration": self.iteration,
      "mode": self.mode
    }

@dataclass(kw_only=True)
class ProgramPoint(BaseProgramPoint):
  child: Optional[BaseProgramPoint]
  iteration: int

  def export(self):
    return {
      "child": self.child and self.child.export(),
      "iteration": self.iteration
    }

# @dataclass(kw_only=True)
# class ProgramMark():
#   point: ProgramPoint
#   term: am.Term

#   def export(self):
#     return {
#       "term": self.term.export()
#     }

class Program(BaseProgram):
  def __init__(self, block: Block, handle):
    super().__init__(block, handle)

    self._block = block
    self._handle = handle

    self._child_owner: Optional[ProgramOwner]
    self._iteration_count: Optional[int]
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

  def study_block(self, block):
    if not isinstance(block, Block) or not self._child_owner:
      return None

    _, count_result = block.count.evaluate_constant(self._handle.context)

    if isinstance(count_result, EllipsisType):
      return None

    new_count = count_result.value if (count_result.value != 'forever') else math.inf

    if (new_count - 1) < self._iteration:
      return None

    child_result = self._child_owner.study_block(block.block)
    child_point, child_mark = child_result or (None, None)

    if math.isfinite(new_count):
      child_duration = block.block.duration()

      if child_mark:
        term = child_mark.term + child_duration * (new_count - self._iteration - 1)
      else:
        term = child_duration * (new_count - self._iteration)
    else:
      term = am.DurationTerm.forever()

    return ProgramPoint(
      child=child_point,
      iteration=self._iteration
    ), am.Mark(
      term,
      ({ 0: child_mark } if child_mark else {}),
      ({} if child_mark else { 0: am.DurationTerm.zero() })
    )

  def swap(self, block: Block):
    assert self._child_owner

    self.block = block

    if not self._child_owner.swap(block.block):
      self._child_owner.halt()
      self._point = ProgramPoint(
        child=None,
        iteration=self._iteration
      )

  def term_info(self, children_terms):
    if self._iteration_count is None:
      return am.DurationTerm.forever()

    return (children_terms[0] + self._block.block.duration() * (self._iteration_count - self._iteration - 1)), {}

  async def run(self, point: Optional[ProgramPoint], stack):
    self._child_owner = None

    while True:
      analysis, result = self._block.count.evaluate_final(EvalContext(stack))
      self._handle.send_analysis(analysis)

      if not isinstance(result, EllipsisType):
        break

      self._mode = ProgramMode.Failed()
      self._handle.send_location(ProgramLocation(self._mode.export()))

      await self._mode.event.wait()

      if isinstance(self._mode, ProgramMode.Halting):
        return

    self._iteration_count = result.value if (result.value != 'forever') else None
    self._point = point or ProgramPoint(child=None, iteration=0)

    while True:
      current_point = self._point

      self._iteration = current_point.iteration
      self._point = None

      if (self._iteration_count is not None) and (self._iteration >= self._iteration_count):
        break

      self._child_owner = self._handle.create_child(self._block.block)
      self._mode = ProgramMode.Normal(self._child_owner)

      self._handle.send_location(ProgramLocation(
        self._mode.export(),
        count=self._iteration_count,
        iteration=self._iteration
      ))

      child_stack: EvalStack = stack | {
        self._block.symbol: { 'index': self._iteration }
      }

      await self._child_owner.run(current_point.child, child_stack)

      if self._point:
        pass
      elif isinstance(self._mode, ProgramMode.Halting) or ((self._iteration_count is not None) and ((self._iteration + 1) >= self._iteration_count)):
        break

      self._point = ProgramPoint(child=None, iteration=(self._iteration + 1))
      self._handle.collect_children()

    del self._child_owner

import comserde
from dataclasses import dataclass
from enum import IntEnum
from typing import Optional

import automancer as am
from pr1.fiber.parser import BaseProgramPoint, BaseProgram

from .parser import Block


class ProgramMode(IntEnum):
  Halted = 0
  Halting = 1
  Normal = 2

@comserde.serializable
@dataclass(kw_only=True)
class ProgramLocation(am.BaseProgramLocation):
  index: int

  def export(self, context):
    return {
      "index": self.index
    }

@dataclass(kw_only=True)
class ProgramPoint(BaseProgramPoint):
  child: Optional[BaseProgramPoint]
  index: int

  def export(self):
    return {
      "child": self.child and self.child.export(),
      "index": self.index
    }

@am.debug
class Program(BaseProgram):
  def __init__(self, block: Block, handle):
    super().__init__(block, handle)

    self._block = block
    self._handle = handle

    self._child_index: int
    self._child_program: am.ProgramOwner
    self._halting = False
    self._point: Optional[ProgramPoint]

  def halt(self):
    assert not self._halting

    self._halting = True
    self._child_program.halt()

  def jump(self, point: ProgramPoint, /):
    if point.index != self._child_index:
      self._point = point
      self._child_program.halt()
    elif point.child:
      self._child_program.jump(point.child)

  def study_block(self, block):
    if not isinstance(block, Block):
      return None

    child_count = len(block.children)

    if (child_count - 1) < self._child_index:
      return None

    child_result = self._child_program.study_block(block.children[self._child_index])
    child_point, child_mark = child_result or (None, None)

    current_child_term = child_mark.term if child_mark else block.children[self._child_index].duration()
    remaining_children_durations = [child_block.duration() for child_block in block.children[(self._child_index + 1):]]
    remaining_children_terms = [(current_child_term + duration) for duration in [am.DurationTerm.zero(), *am.cumsum(remaining_children_durations)]]

    return ProgramPoint(
      child=child_point,
      index=self._child_index
    ), am.Mark(
      remaining_children_terms[-1],
      ({ self._child_index: child_mark } if child_mark else {}),
      { (self._child_index + relative_child_index + 1): child_term for relative_child_index, child_term in enumerate(remaining_children_terms[:-1]) } | ({} if child_mark else { self._child_index: current_child_term })
    )

  def term_info(self, children_terms):
    current_child_term = children_terms[self._child_index]
    remaining_children_durations = [child_block.duration() for child_block in self._block.children[(self._child_index + 1):]]
    remaining_children_terms = [(current_child_term + duration) for duration in [am.DurationTerm.zero(), *am.cumsum(remaining_children_durations)]]

    return (remaining_children_terms[-1], {
      (self._child_index + relative_child_index + 1): child_term for relative_child_index, child_term in enumerate(remaining_children_terms[:-1])
    })

  async def run(self, point: ProgramPoint, stack):
    self._point = point or ProgramPoint(child=None, index=0)

    while True:
      self._child_index = self._point.index

      if self._child_index >= len(self._block.children):
        break

      child_block = self._block.children[self._child_index]

      self._child_program = self._handle.create_child(child_block, id=self._child_index)
      self._handle.send_location(ProgramLocation(index=self._child_index))
      self._handle.send_term()

      current_point = self._point
      self._point = None

      await self._child_program.run(current_point.child, stack)
      next_index = self._point.index if self._point else (self._child_index + 1)

      if self._halting or (next_index >= len(self._block.children)):
        return

      self._handle.collect_children()

      if not self._point:
        self._point = ProgramPoint(child=None, index=next_index)

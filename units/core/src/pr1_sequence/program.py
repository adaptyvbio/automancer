from dataclasses import dataclass
from enum import IntEnum
from typing import Optional

from pr1.fiber.master2 import ProgramOwner
from pr1.fiber.parser import BaseProgramPoint, BaseProgram
from pr1.fiber.process import ProgramExecEvent
from pr1.util.decorators import debug
from pr1.util.misc import Exportable

from .parser import Block


class ProgramMode(IntEnum):
  Halted = 0
  Halting = 1
  Normal = 2

@dataclass(kw_only=True)
class ProgramLocation(Exportable):
  index: int

  def export(self):
    return {
      "index": self.index
    }

@dataclass(kw_only=True)
class ProgramPoint:
  child: Optional[BaseProgramPoint]
  index: int

@debug
class Program(BaseProgram):
  def __init__(self, block: Block, handle):
    super().__init__(block, handle)

    self._block = block
    # self._block._children = [x.child for x in block._children]
    self._handle = handle

    self._child_index: int
    self._child_program: ProgramOwner
    self._halting = False
    self._point: Optional[ProgramPoint]

  def eta(self, location: ProgramLocation):
    return self._child_program.eta() + sum(child.eta() for child in self._block.children[(location.index + 1):])

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

  async def run(self, point: ProgramPoint, stack):
    self._point = point or ProgramPoint(child=None, index=0)

    while True:
      self._child_index = self._point.index

      if self._child_index >= len(self._block.children):
        break

      child_block = self._block.children[self._child_index]

      self._child_program = self._handle.create_child(child_block, id=self._child_index)
      self._handle.send(ProgramExecEvent(location=ProgramLocation(index=self._child_index)))

      current_point = self._point
      self._point = None

      await self._child_program.run(current_point.child, stack)
      next_index = self._point.index if self._point else (self._child_index + 1)

      if self._halting or (next_index >= len(self._block.children)):
        return

      self._handle.collect_children()

      if not self._point:
        self._point = ProgramPoint(child=None, index=next_index)

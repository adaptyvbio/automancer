from .master2 import ProgramHandle, ProgramOwner
from .parser import BaseBlock, BlockProgram


class TransparentProgram(BlockProgram):
  def __init__(self, child: BaseBlock, handle: ProgramHandle):
    self._child = child
    self._handle = handle

    self._owner: ProgramOwner

  def halt(self):
    self._owner.halt()

  async def run(self, point, stack):
    self._owner = self._handle.create_child(self._child)
    await self._owner.run(point, stack)
    del self._owner

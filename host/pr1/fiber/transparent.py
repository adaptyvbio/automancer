from .master2 import ProgramHandle, ProgramOwner
from .parser import BaseBlock, BaseProgram, BaseProgramLocation


class TransparentProgramLocation(BaseProgramLocation):
  def export(self, context) -> dict:
    return {}


class TransparentProgram(BaseProgram):
  def __init__(self, block: BaseBlock, handle: ProgramHandle):
    super().__init__(block, handle)

    self._child = block
    self._handle = handle

    self._owner: ProgramOwner

  def halt(self):
    self._owner.halt()

  async def run(self, point, stack):
    self._handle.send_location(TransparentProgramLocation())
    self._owner = self._handle.create_child(self._child)

    await self._owner.run(point, stack)
    del self._owner

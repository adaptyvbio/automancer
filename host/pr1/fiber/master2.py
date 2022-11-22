import asyncio
import traceback
from typing import Any, Callable, Optional

from .parser import BlockProgram, BlockState, FiberProtocol
from ..chip import Chip


class BlockMesh(dict[str, object]):
  pass

class ClaimSymbol:
  def __init__(self, parent: Optional['ClaimSymbol'] = None):
    self.parent = parent

  # other > self => other is a descendant of self
  def __gt__(self, other: 'ClaimSymbol') -> bool:
    other_symbol = other.parent

    while other_symbol:
      if other_symbol == self:
        return True

      other_symbol = other_symbol.parent

    return False


class SegExec:
  def __init__(self, *, block, master, parent):
    self._block = block
    self._head = None
    self._master = master
    self._parent = parent

  def create(self):
    pass

  def enter(self):
    async def run():
      await self._block.run()
      self._master._heads.remove(task)
      self._parent.next(self)

    # loop = asyncio.get_event_loop()
    # task = loop.create_task(run())
    task = asyncio.create_task(run())
    self._head = task
    self._master._heads.add(task)

class SegBlock:
  Exec = SegExec

  def __init__(self, delay = 0.1, name = "Untitled"):
    self._delay = delay
    self._name = name

  async def run(self):
    print("[BEG] " + self._name)
    await asyncio.sleep(self._delay)
    print("[END] " + self._name)


class ParExec:
  def __init__(self, *, block, master, parent):
    self._block = block
    self._master = master
    self._parent = parent

    self._children = [None for _ in range(len(self._block._children))]

  def create(self):
    for child_index, child_block in enumerate(self._block._children):
      child_exec = child_block.Exec(block=child_block, master=self._master, parent=self)
      child_exec.create()
      self._children[child_index] = child_exec

  def enter(self):
    for child_exec in self._children:
      child_exec.enter()

  def next(self, child_exec):
    child_index = self._children.index(child_exec)
    self._children[child_index] = None

    if all(child_exec is None for child_exec in self._children):
      self._parent.next(self)


class ParBlock:
  Exec = ParExec

  def __init__(self, children, /):
    self._children = children


class Master:
  def __init__(self, protocol: FiberProtocol, /, chip: Chip):
    self.chip = chip
    self.protocol = protocol

    self._program: BlockProgram
    self._state: Any

    self._pause_future: Optional[asyncio.Future] = None
    self._resume_future: Optional[asyncio.Future] = None

  @property
  def paused(self):
    return self._resume_future is not None

  @property
  def pausing(self):
    return self._pause_future is not None

  def pause(self):
    self._pause_future = asyncio.Future()
    self._program.pause()

  async def wait_pause(self):
    assert not self.paused and not self.pausing
    self.pause()

    assert self._pause_future
    await self._pause_future

  def resume(self):
    assert self._resume_future

    self._resume_future.set_result(None)
    self._resume_future = None

  async def run(self, initial_state = None):
    symbol = ClaimSymbol()

    self._program = self.protocol.root.Program(block=self.protocol.root, master=self, parent=self)

    async for event in self._program.run(initial_state, symbol):
      yield event

      if self._pause_future:
      # if info.stopped and self._pause_future:
        self._pause_future.set_result(True)
        self._pause_future = None

        self._resume_future = asyncio.Future()
        await self._resume_future

  async def start(self, done_callback: Callable, update_callback: Callable):
    async def run_loop():
      nonlocal start_future

      try:
        async for event in self.run():
          if event.state:
            self._state = event.state

          if start_future:
            start_future.set_result(None)
            start_future = None
          else:
            update_callback()

        done_callback()
      except Exception:
        traceback.print_exc()

    start_future = asyncio.Future()
    self._task = asyncio.create_task(run_loop())

    await start_future

  # def stop(self):
  #   self._task.cancel()

  # def enter_state(self, state: BlockState, parent_mesh: BlockMesh, symbol: ClaimSymbol) -> BlockMesh:
  #   mesh = dict()

  #   for namespace, runner in self.chip.runners.items():
  #     mesh[namespace] = runner.enter_state(state[namespace], parent_mesh=parent_mesh, symbol=symbol)

  #   return BlockMesh(mesh)

  # def exit_state(self, mesh: BlockMesh):
  #   for namespace, runner in self.chip.runners.items():
  #     runner.exit_state(mesh[namespace])

  async def hold(self, state: BlockState, symbol: ClaimSymbol):
    await asyncio.gather(*[runner.hold(state[namespace], symbol) for namespace, runner in self.chip.runners.items() if state.get(namespace)])

  def export(self):
    return {
      "protocol": self.protocol.export(),
      "state": self._state.export()
    }

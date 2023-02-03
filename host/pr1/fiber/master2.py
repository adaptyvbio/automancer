import asyncio
from asyncio import Future, Task
from dataclasses import dataclass, field
import traceback
from typing import TYPE_CHECKING, Any, AsyncGenerator, Callable, Optional

from ..util.types import SimpleCallbackFunction
from ..util.misc import Exportable
from ..state import DemoStateInstance, GlobalStateManager, StateInstanceCollection
from ..error import MasterError
from .process import ProgramExecEvent
from .eval import EvalStack
from ..units.base import BaseRunner
from .parser import BaseBlock, BaseProgramPoint, BlockProgram, BlockState, FiberProtocol
from ..chip import Chip
from ..devices.claim import ClaimSymbol
from ..util.iterators import DynamicParallelIterator
from ..ureg import ureg

if TYPE_CHECKING:
  from ..host import Host


class Master:
  def __init__(self, protocol: FiberProtocol, /, chip: Chip, *, host: 'Host'):
    self.chip = chip
    self.host = host
    self.protocol = protocol

    self.state_manager = GlobalStateManager({ 'foo': DemoStateInstance })

    self._errors = list[MasterError]()
    self._events = list[ProgramExecEvent]()
    self._location: Any
    self._update_callback: Optional[SimpleCallbackFunction] = None
    self._updating_soon = False
    self._task: Optional[Task[None]] = None

    self._done_future: Optional[Future[None]] = None
    self._start_future: Optional[Future[None]] = None
    # self._pause_future: Optional[Future] = None

  async def done(self):
    assert self._done_future
    await self._done_future

  def halt(self):
    self._program.halt()

  def pause(self):
    self._program.pause()

    # Only set the future after in case the call was illegal and is rejected by the child program.
    self._pause_future = Future()

  async def wait_done(self):
    assert self._done_future
    await self._done_future

  async def wait_halt(self):
    self.halt()
    await self.wait_done()

  async def wait_pause(self):
    self.pause()

    assert self._pause_future
    await self._pause_future

  def resume(self):
    self._program.resume()

  async def run(self, update_callback: SimpleCallbackFunction):
    from random import random

    runtime_stack = {
      self.protocol.global_env: dict(
        random=random,
        unit=ureg
      ),
      self.protocol.user_env: dict()
    }

    self._update_callback = update_callback

    self._handle = ProgramHandle(self, id=0)
    program = self.protocol.root.Program(self.protocol.root, self._handle)
    owner = ProgramOwner(self._handle, program)

    self.update_soon()

    async def func():
      assert self._done_future

      try:
        await owner.run(runtime_stack)
        self._handle.collect()
      except Exception as e:
        self._done_future.set_exception(e)
      else:
        self._done_future.set_result(None)

    self._task = asyncio.create_task(func())

    self._done_future = Future()
    self._start_future = Future()
    await self._start_future


  async def call_resume(self):
    self.transfer_state(); print("X: Master1")

  def send_message(self, block_path: list, exec_path: list, message: object):
    program = self._program

    for block_key, exec_key in zip(block_path, exec_path):
      program = program.get_child(block_key, exec_key)

    program.import_message(message)

  def create_instance(self, state: BlockState, *, notify: Callable, stack: EvalStack, symbol: ClaimSymbol):
    runners = { namespace: runner for namespace, runner in self.chip.runners.items() if state.get(namespace) }
    return StateInstanceCollection(state, notify=notify, runners=runners, stack=stack, symbol=symbol)

  def transfer_state(self):
    for runner in self.chip.runners.values():
      runner.transfer_state()

  def write_state(self):
    for runner in self.chip.runners.values():
      runner.write_state()

  def export(self):
    return {
      "errors": [error.export() for error in self._errors],
      "location": self._location.export(),
      "protocol": self.protocol.export()
    }


  def _update(self):
    errors = list[MasterError]()

    def update_handle(handle: ProgramHandle):
      nonlocal errors

      entry = ProgramHandleEventEntry(
        location=(handle._location if handle._updated else None)
      )

      errors += handle._errors

      handle._errors.clear()
      handle._updated = False

      for child_handle in handle._children.values():
        child_entry = update_handle(child_handle)
        entry.children[child_handle._id] = child_entry

      return entry

    entry = update_handle(self._handle)
    self._errors += errors

    if self._update_callback:
      self._update_callback()

    if self._start_future:
      self._start_future.set_result(None)
      self._start_future = None

    print(entry.format())
    print(errors)

  def update_soon(self):
    if not self._updating_soon:
      self._updating_soon = True

      def func():
        self._update()
        self._updating_soon = False

      asyncio.get_event_loop().call_soon(func)


@dataclass(kw_only=True)
class ProgramHandleEventEntry:
  children: 'dict[int, ProgramHandleEventEntry]' = field(default_factory=dict)
  location: Optional[Exportable] = None

  def format(self, *, prefix: str = "\n"):
    output = (f"\x1b[37m{self.location!r}\x1b[0m" if self.location else "<no change>")

    for index, (child_id, child) in enumerate(self.children.items()):
      last = index == (len(self.children) - 1)
      output += prefix + ("└── " if last else "├── ") + f"({child_id}) " + child.format(prefix=(prefix + ("    " if last else "│   "))) + (str() if last else "\n")

    return output


class ProgramHandle:
  def __init__(self, parent: 'Master | ProgramHandle', id: int):
    self._children = dict[int, ProgramHandle]()
    self._id = id
    self._next_child_id = 0
    self._parent = parent

    self._errors = list[MasterError]()
    self._location: Optional[Exportable] = None

    self._consumed = False
    self._updated = False

  @property
  def master(self) -> Master:
    return self._parent.master if isinstance(self._parent, ProgramHandle) else self._parent

  def create_child(self, child_block: BaseBlock):
    handle = ProgramHandle(self, id=self._next_child_id)
    program = child_block.Program(child_block, handle)

    self._children[handle._id] = handle
    self._next_child_id += 1

    return ProgramOwner(handle, program)

  def collect(self):
    self.master._update()

    for child_handle in list(self._children.values()):
      if child_handle._consumed:
        del self._children[child_handle._id]

  def send(self, event: ProgramExecEvent, *, update: bool = True):
    self._errors += event.errors
    self._location = event.location or self._location
    self._updated = True

    if update:
      self.master.update_soon()

class ProgramOwner:
  def __init__(self, handle: ProgramHandle, program: BlockProgram):
    self._handle = handle
    self._program = program

  def halt(self):
    self._program.halt()

  async def run(self, stack: EvalStack):
    last_event = await self._program.run(stack)

    if last_event:
      self._handle._location = last_event.location or self._handle._location
      self._handle._updated = True

    if isinstance(self._handle._parent, ProgramHandle):
      for child_handle in self._handle._children.values():
        assert child_handle._consumed

      self._handle._consumed = True

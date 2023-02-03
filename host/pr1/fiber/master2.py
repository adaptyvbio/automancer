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
    self._location: Optional[ProgramHandleEventEntry] = None
    self._owner: ProgramOwner
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
    self._handle._program = self.protocol.root.Program(self.protocol.root, self._handle)
    self._owner = ProgramOwner(self._handle, self._handle._program)

    async def func():
      assert self._done_future

      try:
        self.update_soon()
        await self._owner.run(runtime_stack)
        self._handle.collect()
      except Exception as e:
        if self._start_future:
          self._start_future.set_exception(e)
        else:
          self._done_future.set_exception(e)
      else:
        self._done_future.set_result(None)

    self._task = asyncio.create_task(func())

    self._done_future = Future()
    self._start_future = Future()
    await self._start_future


  async def call_resume(self):
    self.transfer_state(); print("X: Master1")

  def receive(self, exec_path: list[int], message: Any):
    current_handle = self._handle

    for exec_key in exec_path:
      current_handle = current_handle._children[exec_key]

    match message["type"]:
      case "halt":
        current_handle._program.halt()
      case _:
        current_handle._program.receive(message)

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
    assert self._location

    return {
      "errors": [error.export() for error in self._errors],
      "location": self._location.export(),
      "protocol": self.protocol.export()
    }


  def _update(self, *, partial: bool = False):
    errors = list[MasterError]()

    def update_handle(handle: ProgramHandle, existing_entry: Optional[ProgramHandleEventEntry]):
      nonlocal errors

      update_entry = ProgramHandleEventEntry(
        location=(handle._location if handle._updated else None)
      )

      if existing_entry and handle._updated:
        existing_entry.location = handle._location

      errors += handle._errors

      handle._errors.clear()
      handle._updated = False

      for child_id, child_handle in list(handle._children.items()):
        child_existing_entry = existing_entry and existing_entry.children.get(child_id)
        child_entry = update_handle(child_handle, child_existing_entry)
        update_entry.children[child_id] = child_entry

        if existing_entry and (not child_existing_entry):
          existing_entry.children[child_id] = child_entry

        if child_handle._consumed:
          del handle._children[child_id]

      return update_entry

    entry = update_handle(self._handle, self._location)

    if not self._location:
      self._location = entry

    self._errors += errors

    if self._update_callback and (not partial):
      self._update_callback()

    if self._start_future:
      self._start_future.set_result(None)
      self._start_future = None

    print()
    print(f"partial={partial}")
    print(entry.format())
    # print(self._location.format())
    print(errors)
    print('---')

  def update_soon(self):
    if not self._updating_soon:
      self._updating_soon = True

      def func():
        self._update()
        self._updating_soon = False

      asyncio.get_event_loop().call_soon(func)


@dataclass(kw_only=True)
class ProgramHandleEventEntry(Exportable):
  children: 'dict[int, ProgramHandleEventEntry]' = field(default_factory=dict)
  location: Optional[Exportable] = None

  def export(self):
    assert self.location

    location_exported = self.location.export()
    assert isinstance(location_exported, dict)

    return {
      "children": {
        child_id: child.export() for child_id, child in self.children.items()
      },
      **location_exported
    }

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
    self._parent = parent
    self._program: BlockProgram

    self._errors = list[MasterError]()
    self._location: Optional[Exportable] = None

    self._consumed = False
    self._updated = False

  @property
  def master(self) -> Master:
    return self._parent.master if isinstance(self._parent, ProgramHandle) else self._parent

  def create_child(self, child_block: BaseBlock, *, id: int = 0):
    handle = ProgramHandle(self, id=id)
    handle._program = child_block.Program(child_block, handle)

    assert not (handle._id in self._children)
    self._children[handle._id] = handle

    return ProgramOwner(handle, handle._program)

  def collect(self):
    self.master._update(partial=True)

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

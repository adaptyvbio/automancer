import asyncio
from dataclasses import dataclass, field
import traceback
from typing import TYPE_CHECKING, Any, AsyncGenerator, Callable, Optional

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

    self._child_state_terminated: bool
    self._child_stopped: bool
    self._errors = list[MasterError]()
    self._events = list[ProgramExecEvent]()
    self._program: BlockProgram
    self._location: Any

    self._done_future: Optional[asyncio.Future] = None
    self._pause_future: Optional[asyncio.Future] = None

  def halt(self):
    self._program.halt()

  def pause(self):
    self._program.pause()

    # Only set the future after in case the call was illegal and is rejected by the child program.
    self._pause_future = asyncio.Future()

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

  async def run(self):
    from random import random

    runtime_stack = {
      self.protocol.global_env: dict(
        random=random,
        unit=ureg
      ),
      self.protocol.user_env: dict()
    }


    # def listener(event):
    #   self._errors += event.errors
    #   print("Event >", event)

    self._handle = ProgramHandle(self, id=0)
    self._program = self.protocol.root.Program(self.protocol.root, self._handle)
    owner = ProgramOwner(self._handle, self._program)

    last_event = await owner.run(runtime_stack)
    self._handle.collect()

    # async for event in self._program.run(initial_location, None, runtime_stack, symbol):
    #   self._errors += event.errors

    #   # Write the state if the state child program was terminated and is not anymore, i.e. it was replaced.
    #   if self._child_state_terminated and (not event.state_terminated):
    #     self.write_state(); print("Y: Master3")

    #   # Write the state if the state child program was paused and is not anymore.
    #   elif self._child_stopped and (not event.stopped):
    #     self.write_state(); print("Y: Master1")

    #   # Transfer and write the state if the state child program is paused but not terminated.
    #   if event.stopped and not (event.state_terminated):
    #     self.transfer_state(); print("X: Master2")
    #     self.write_state(); print("Y: Master2")

    #   self._child_state_terminated = event.state_terminated
    #   self._child_stopped = event.stopped

    #   yield event

    #   if event.stopped and self._pause_future:
    #     self._pause_future.set_result(True)
    #     self._pause_future = None

    # self.transfer_state()
    # self.write_state()

  async def call_resume(self):
    self.transfer_state(); print("X: Master1")

  def send_message(self, block_path: list, exec_path: list, message: object):
    program = self._program

    for block_key, exec_key in zip(block_path, exec_path):
      program = program.get_child(block_key, exec_key)

    program.import_message(message)

  async def start(self, done_callback: Callable, update_callback: Callable):
    async def run_loop():
      nonlocal start_future

      try:
        async for event in self.run():
          self._events.append(event)

          if event.location:
            self._location = event.location

          if start_future:
            start_future.set_result(None)
            start_future = None
          elif not event.terminated:
            update_callback()

        done_callback()

        assert self._done_future
        self._done_future.set_result(None)
      except Exception:
        traceback.print_exc()

    start_future = asyncio.Future()

    self._done_future = asyncio.Future()
    self._task = asyncio.create_task(run_loop())

    await start_future

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


  def _process_handle_tree(self, handle: Optional['ProgramHandle'] = None, entry: 'Optional[ProgramHandleEventEntry]' = None):
    handle = handle or self._handle

    if handle._will_update:
      return None

    entry = ProgramHandleEventEntry(
      location=(handle._location if handle._updated else None)
    )

    for child_handle in handle._children.values():
      child_entry = self._process_handle_tree(child_handle)

      if not child_entry:
        return None

      entry.children[child_handle._id] = child_entry

    return entry

  def _reset_handle_tree(self, handle: Optional['ProgramHandle'] = None):
    handle = handle or self._handle
    handle._updated = False

    for child_handle in handle._children.values():
      self._reset_handle_tree(child_handle)

  def _update(self):
    entry = self._process_handle_tree()

    if entry:
      self._reset_handle_tree()
      print(entry.format())


@dataclass(kw_only=True)
class ProgramHandleEventEntry:
  children: 'dict[int, ProgramHandleEventEntry]' = field(default_factory=dict)
  location: Optional[Exportable] = None

  def format(self, *, prefix: str = str()):
    output = (f"\x1b[37m{self.location!r}\x1b[0m" if self.location else "<no change>") + "\n"

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
    self._will_update = True
    self._updated: bool

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
    self._will_update = False

    if update:
      self.master._update()

class ProgramOwner:
  def __init__(self, handle: ProgramHandle, program: BlockProgram):
    self._handle = handle
    self._program = program

  def halt(self):
    self._program.halt()

  async def run(self, stack: EvalStack):
    self._handle._updated = False
    self._handle._will_update = True

    last_event = await self._program.run(stack)

    if last_event:
      self._handle._location = last_event.location or self._handle._location
      self._handle._updated = True

    if isinstance(self._handle._parent, ProgramHandle):
      for child_handle in self._handle._children.values():
        assert child_handle._consumed

      self._handle._consumed = True

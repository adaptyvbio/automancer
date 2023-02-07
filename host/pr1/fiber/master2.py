from abc import abstractmethod
import asyncio
from asyncio import Future, Task
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Callable, Optional

from ..history import TreeAdditionChange, TreeChange, TreeRemovalChange, TreeUpdateChange
from ..util.types import SimpleCallbackFunction
from ..util.misc import Exportable, IndexCounter, UnreachableError
from ..state import DemoStateInstance, GlobalStateManager, UnitStateManager
from ..error import MasterError
from .process import ProgramExecEvent
from .eval import EvalStack
from ..units.base import BaseRunner
from .parser import BaseBlock, BaseProgramPoint, BlockProgram, BlockState, FiberProtocol, HeadProgram
from ..chip import Chip
from ..devices.claim import ClaimSymbol
from ..ureg import ureg

if TYPE_CHECKING:
  from ..host import Host


class Master:
  def __init__(self, protocol: FiberProtocol, /, chip: Chip, *, host: 'Host'):
    self.chip = chip
    self.host = host
    self.protocol = protocol

    self.state_manager = GlobalStateManager({
      namespace: (Consumer(runner) if issubclass(Consumer, UnitStateManager) else Consumer) for namespace, runner in chip.runners.items() if (Consumer := runner.StateConsumer)
    })

    self._entry_counter = IndexCounter(start=1)
    self._errors = list[MasterError]()
    self._events = list[ProgramExecEvent]()
    self._location: Optional[ProgramHandleEventEntry] = None
    self._owner: ProgramOwner
    self._update_callback: Optional[SimpleCallbackFunction] = None
    self._updating_soon = False
    self._task: Optional[Task[None]] = None

    self._done_future: Optional[Future[None]] = None
    self._start_future: Optional[Future[None]] = None

  async def done(self):
    assert self._done_future
    await self._done_future

  def halt(self):
    self._handle._program.halt()

  def pause(self):
    self._program.pause()

    # Only set the future after in case the call was illegal and is rejected by the child program.
    self._pause_future = Future()

  async def wait_halt(self):
    self.halt()
    await self.done()

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
        self.update()
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


  def receive(self, exec_path: list[int], message: Any):
    current_handle = self._handle

    for exec_key in exec_path:
      current_handle = current_handle._children[exec_key]

    current_handle._program.receive(message)


  def export(self):
    assert self._location

    return {
      "errors": [error.export() for error in self._errors],
      "location": self._location.export(),
      "protocol": self.protocol.export()
    }


  def update(self):
    self._updating_soon = False

    errors = list[MasterError]()
    useful = False

    changes = list[TreeChange]()

    def update_handle(handle: ProgramHandle, existing_entry: Optional[ProgramHandleEventEntry], entry_id: int = 0, parent_entry: Optional[ProgramHandleEventEntry] = None):
      nonlocal errors, useful

      update_entry = ProgramHandleEventEntry(
        index=(existing_entry.index if existing_entry else self._entry_counter.new()),
        location=(handle._location if handle._updated else None)
      )

      if not existing_entry:
        assert handle._location

        if parent_entry:
          parent_entry.children[entry_id] = update_entry
        else:
          self._location = update_entry

        changes.append(TreeAdditionChange(
          block_child_id=entry_id,
          location=handle._location,
          parent_index=(parent_entry.index if parent_entry else 0)
        ))

      elif handle._updated:
        assert handle._location
        existing_entry.location = handle._location

        changes.append(TreeUpdateChange(
          index=existing_entry.index,
          location=handle._location
        ))

      # Collect errors here for their order to be correct.
      errors += handle._errors

      for child_id, child_handle in list(handle._children.items()):
        child_existing_entry = existing_entry and existing_entry.children.get(child_id)
        update_entry.children[child_id] = update_handle(child_handle, child_existing_entry, child_id, existing_entry or update_entry)

      if handle._consumed:
        assert existing_entry
        self._entry_counter.delete(existing_entry.index)

        changes.append(TreeRemovalChange(
          index=existing_entry.index
        ))

        if isinstance(parent_handle := handle._parent, ProgramHandle):
          del parent_handle._children[entry_id]

        if parent_entry:
          del parent_entry.children[entry_id]
        else:
          self._location = None

      useful = useful or (handle._updated and (not handle._consumed))

      handle._errors.clear()
      handle._updated = False

      return update_entry

    update_entry = update_handle(self._handle, self._location)

    self._errors += errors

    if self._update_callback and useful:
      self._update_callback()

    if self._start_future:
      self._start_future.set_result(None)
      self._start_future = None

    # from pprint import pprint
    # pprint(changes)

    # for change in changes:
    #   print(change.serialize())

    print()
    print(f"useful={useful}")
    print(update_entry.format())
    # print()
    # print(self._location and self._location.format())
    print(errors)
    print('---')

  def update_soon(self):
    if not self._updating_soon:
      self._updating_soon = True

      def func():
        if self._updating_soon:
          self.update()

      asyncio.get_event_loop().call_soon(func)


@dataclass(kw_only=True)
class ProgramHandleEventEntry(Exportable):
  children: 'dict[int, ProgramHandleEventEntry]' = field(default_factory=dict)
  index: int
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
    output = f"[{self.index}] " + (f"\x1b[37m{self.location!r}\x1b[0m" if self.location else "<no change>")

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

  async def pause_children(self):
    for child_handle in self._children.values():
      if isinstance(child_handle._program, HeadProgram):
        await child_handle._program.pause(loose=True)
      else:
        await child_handle.pause_children()

  async def resume_parent(self):
    current_handle = self

    while (current_handle := current_handle._parent) and isinstance(current_handle, ProgramHandle):
      if isinstance(current_handle._program, HeadProgram):
        await current_handle._program.resume(loose=True)
        break

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

    for child_handle in self._handle._children.values():
      assert child_handle._consumed

    self._handle._consumed = True

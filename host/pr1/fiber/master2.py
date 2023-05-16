from asyncio import Task
from logging import Logger
from dataclasses import dataclass, field
from os import PathLike
from pathlib import Path
from traceback import StackSummary
from typing import TYPE_CHECKING, Any, Optional
import asyncio
import traceback

from ..util.asyncio import wait_all
from ..host import logger
from ..util.decorators import provide_logger
from ..history import TreeAdditionChange, TreeChange, TreeRemovalChange, TreeUpdateChange
from ..util.pool import Pool
from ..util.types import SimpleCallbackFunction
from ..util.misc import Exportable, IndexCounter
from ..master.analysis import MasterAnalysis
from .process import ProgramExecEvent
from .eval import EvalStack
from .parser import BaseBlock, BaseProgramPoint, BaseProgram, FiberProtocol, HeadProgram
from ..chip import Chip
from ..ureg import ureg

if TYPE_CHECKING:
  from ..host import Host


@provide_logger(logger)
class Master:
  def __init__(self, protocol: FiberProtocol, /, chip: Chip, *, cleanup_callback: Optional[SimpleCallbackFunction] = None, host: 'Host'):
    self.chip = chip
    self.host = host
    self.protocol = protocol

    self.runners = {
      namespace: unit.MasterRunner(self) for namespace, unit in self.host.units.items() if hasattr(unit, 'MasterRunner')
    }

    self._analysis = MasterAnalysis()
    self._cleanup_callback = cleanup_callback
    self._entry_counter = IndexCounter(start=1)
    self._events = list[ProgramExecEvent]()
    self._location: Optional[ProgramHandleEventEntry] = None
    self._logger: Logger
    self._owner: ProgramOwner
    self._pool = Pool()
    self._update_callback: Optional[SimpleCallbackFunction] = None
    self._update_lock_depth = 0
    self._update_handle: Optional[asyncio.Handle] = None
    self._update_traces = list[StackSummary]()
    self._task: Optional[Task[None]] = None

    for line in self.protocol.root.format_hierarchy().splitlines():
      self._logger.debug(line)

  @property
  def pool(self):
    return self._pool

  def halt(self):
    self._handle._program.halt()

  # def pause(self):
  #   self._program.pause()

  #   # Only set the future after in case the call was illegal and is rejected by the child program.
  #   self._pause_future = Future()

  # async def wait_pause(self):
  #   self.pause()

  #   assert self._pause_future
  #   await self._pause_future

  # def resume(self):
  #   self._program.resume()

  async def run(self, update_callback: SimpleCallbackFunction):
    from random import random

    def ExpPath(path: PathLike[str] | str):
      return self.chip.dir / path

    def runtime_open(path: PathLike[str] | str, /, **kwargs):
      return open(ExpPath(path), **kwargs)

    runtime_stack = {
      self.protocol.global_env: {
        'ExpPath': ExpPath,
        'Path': Path,
        'open': runtime_open,
        'random': random,
        'unit': ureg
      },
      self.protocol.user_env: dict()
    }

    for namespace, protocol_unit_details in self.protocol.details.items():
      runtime_stack |= protocol_unit_details.create_runtime_stack(self.runners[namespace])

    self._update_lock_depth = 0
    self._update_callback = update_callback

    self._handle = ProgramHandle(self, id=0)
    self._handle._program = self.protocol.root.create_program(self._handle)
    self._owner = ProgramOwner(self._handle, self._handle._program)

    async def func():
      try:
        self.update_soon()
        await self._owner.run(None, runtime_stack)
        self.update_now()
      finally:
        if self._update_handle:
          self._update_handle.cancel()
          self._update_handle = None

        if self._cleanup_callback:
          self._cleanup_callback()

        await wait_all([runner.cleanup() for runner in self.runners.values()])

    async with Pool.open() as pool:
      self._pool = pool
      self._pool.start_soon(func())

  def receive(self, exec_path: list[int], message: Any):
    current_handle = self._handle

    for exec_key in exec_path:
      current_handle = current_handle._children[exec_key]

    current_handle._program.receive(message)


  def export(self):
    if not self._location:
      return None

    return {
      "analysis": self._analysis.export(),
      "location": self._location.export(),
      "protocol": self.protocol.export()
    }


  def update(self):
    if False:
      for index, trace in enumerate(self._update_traces):
        print(f"Trace {index}")

        for line in trace.format():
          print(line, end=str())

    self._update_traces.clear()

    analysis = MasterAnalysis()
    useful = False

    changes = list[TreeChange]()

    def update_handle(handle: ProgramHandle, existing_entry: Optional[ProgramHandleEventEntry], entry_id: int = 0, parent_entry: Optional[ProgramHandleEventEntry] = None):
      nonlocal analysis, useful

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
      analysis += handle._analysis

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

      handle._analysis.clear()
      handle._updated = False

      return update_entry

    update_entry = update_handle(self._handle, self._location)

    self._analysis += analysis

    if self._update_callback and useful:
      self._update_callback()

    # from pprint import pprint
    # pprint(changes)

    # for change in changes:
    #   print(change.serialize())

    print('---')
    print(f"useful={useful}")
    print(update_entry.format())
    # print()
    # print(self._location and self._location.format())
    print(analysis)
    # pprint(changes)
    # data = comserde.dumps(changes, list[TreeChange])
    # pprint(comserde.loads(data, list[TreeChange]))
    print('---')

  # def update_soon(self):
    # def func():
    #   if self._update_status == 3:
    #     self._update_status = 0
    #     self.update()
    #   else:
    #     self._update_status += 1
    #     asyncio.get_event_loop().call_soon(func)

    # if self._update_status == 0:
    #   asyncio.get_event_loop().call_soon(func)

    # self._update_status = 1

  def update_now(self):
    if self._update_handle:
      self._update_handle.cancel()
      self._update_handle = None

    self.update()

  def update_soon(self):
    if self._update_lock_depth > 0:
      return

    self._update_traces.append(StackSummary(traceback.extract_stack()[:-2]))

    if not self._update_handle:
      def func():
        self._update_handle = None
        self.update()

      self._update_handle = asyncio.get_event_loop().call_soon(func)


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
    self._program: BaseProgram

    self._analysis = MasterAnalysis()
    self._location: Optional[Exportable] = None

    self._consumed = False
    self._failed = False
    self._locked = False
    self._updated = False

  @property
  def master(self) -> Master:
    return self._parent.master if isinstance(self._parent, ProgramHandle) else self._parent

  def ancestors(self, *, include_self: bool = False, same_type: bool = True):
    reversed_ancestors = list[BaseProgram]()

    if include_self:
      reversed_ancestors.append(self._program)

    handle = self

    while not isinstance(handle := handle._parent, Master):
      if (not same_type) or isinstance(handle._program, type(self._program)):
        reversed_ancestors.insert(0, handle._program)

    return reversed_ancestors[::-1]


  def collect_children(self):
    self.master.update_now()

  def create_child(self, child_block: BaseBlock, *, id: int = 0):
    handle = ProgramHandle(self, id=id)
    handle._program = child_block.create_program(handle)

    assert not (handle._id in self._children)
    self._children[handle._id] = handle

    return ProgramOwner(handle, handle._program)

  def increment_lock(self):
    self.master._update_lock_depth += 1

    def release():
      self.master._update_lock_depth -= 1

    return release

  async def pause_children(self):
    for child_handle in self._children.values():
      if isinstance(child_handle._program, HeadProgram):
        await child_handle._program.pause()
      else:
        await child_handle.pause_children()

  def pause_unstable_parent_of_children(self):
    current_handle = self

    while (child_handle := current_handle._children.get(0)):
      current_handle = child_handle

    current_handle.pause_unstable_parent()

  def pause_unstable_parent(self):
    current_handle = self
    unstable_program = self._program
    assert isinstance(unstable_program, HeadProgram)

    while isinstance(current_handle := current_handle._parent, ProgramHandle):
      if isinstance(current_handle._program, HeadProgram):
        if current_handle._program.stable():
          break

        unstable_program = current_handle._program

    self.master._pool.start_soon(unstable_program.pause())

  async def resume_parent(self):
    current_handle = self

    while (current_handle := current_handle._parent) and isinstance(current_handle, ProgramHandle):
      if isinstance(current_handle._program, HeadProgram):
        return await asyncio.shield(self.master._pool.start_soon(current_handle._program.resume(loose=True)))

    return True

  def send(self, event: ProgramExecEvent, *, lock: bool = False):
    self._analysis += event.analysis
    self._location = event.location or self._location
    self._updated = True

    if (not self._locked) and lock:
      self._locked = True
      self.master._update_lock_depth += 1

      if self.master._update_handle:
        self.master._update_handle.cancel()
        self.master._update_handle = None
    else:
      self.master.update_soon()

  def release_lock(self, *, sure: bool = False):
    if self._locked:
      self._locked = False
      self.master._update_lock_depth -= 1

      if self.master._update_lock_depth < 1:
        self.master.update_soon()
    elif sure:
      raise ValueError("Not locked")

class ProgramOwner:
  def __init__(self, handle: ProgramHandle, program: BaseProgram):
    self._handle = handle
    self._program = program

  def halt(self):
    self._program.halt()

  def jump(self, point, /):
    self._program.jump(point)

  async def run(self, point: Optional[BaseProgramPoint], stack: EvalStack):
    await self._program.run(point, stack)

    for child_handle in self._handle._children.values():
      assert child_handle._consumed

    self._handle._consumed = True

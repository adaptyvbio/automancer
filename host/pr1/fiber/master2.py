from asyncio import Task
import math
from random import random
import time
from uuid import uuid4
import comserde
from logging import Logger
from dataclasses import dataclass, field
from os import PathLike
from pathlib import Path
from pprint import pprint
from traceback import StackSummary
from typing import IO, TYPE_CHECKING, Any, Optional, Self
import asyncio
import traceback

from ..report import ExperimentReportEvent
from ..eta import DurationTerm, Term
from ..analysis import DiagnosticAnalysis
from ..draft import DraftCompilation
from ..util.asyncio import wait_all
from ..host import logger
from ..util.decorators import provide_logger
from ..history import TreeAdditionChange, BaseTreeChange, TreeChange, TreeRemovalChange, TreeUpdateChange
from ..util.pool import Pool
from ..util.types import SimpleCallbackFunction
from ..util.misc import Exportable, HierarchyNode, IndexCounter
from ..master.analysis import MasterAnalysis, RuntimeAnalysis, RuntimeMasterAnalysisItem
from .process import ProgramExecEvent
from .eval import EvalContext, EvalStack
from .parser import BaseBlock, BaseProgramPoint, BaseProgram, FiberProtocol, HeadProgram
from ..experiment import Experiment
from ..ureg import ureg

if TYPE_CHECKING:
  from ..host import Host


@provide_logger(logger)
class Master:
  def __init__(self, compilation: DraftCompilation, /, experiment: Experiment, *, cleanup_callback: Optional[SimpleCallbackFunction] = None, host: 'Host'):
    assert compilation.protocol

    self.id = str(uuid4())
    self.experiment = experiment
    self.host = host
    self.protocol = compilation.protocol
    self.start_time: float

    self.runners = {
      namespace: plugin.Runner(self) for namespace, plugin in self.host.plugins.items() if hasattr(plugin, 'Runner')
    }

    # TODO: Add additional analysis items (e.g. unavailable device)
    self._initial_analysis = DiagnosticAnalysis.downcast(compilation.analysis)
    self._master_analysis = MasterAnalysis()

    self._cleanup_callback = cleanup_callback
    self._entry_counter = IndexCounter(start=1)
    self._events = list[ProgramExecEvent]()
    self._file: IO[bytes]
    self._logger: Logger
    self._owner: ProgramOwner
    self._pool: Pool
    self._root_entry: Optional[ProgramHandleEntry] = None
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

  async def run(self, update_callback: SimpleCallbackFunction):
    from ..report import ExperimentReportHeader

    def ExpPath(path: PathLike[str] | str):
      return self.experiment.path / path

    def runtime_open(path: PathLike[str] | str, /, **kwargs):
      return open(ExpPath(path), **kwargs)

    runtime_stack: EvalStack = {
      self.protocol.global_symbol: {
        'ExpPath': ExpPath,
        'Path': Path,
        'open': runtime_open,
        'random': random,
        'unit': ureg
      }
    }

    for namespace, protocol_unit_details in self.protocol.details.items():
      runtime_stack |= protocol_unit_details.create_runtime_stack(self.runners[namespace])

    self._update_lock_depth = 0
    self._update_callback = update_callback

    self.start_time = time.time()

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

    with self.experiment.report_path.open("wb") as self._file:
      assert (self.protocol.name is not None)

      report_header = ExperimentReportHeader(
        analysis=self._initial_analysis,
        draft=self.protocol.draft,
        name=self.protocol.name,
        root=self.protocol.root,
        start_time=self.start_time
      )

      comserde.dump(report_header, self._file)
      self._logger.debug(f"Saving data in {self.experiment.report_path}")

      async with Pool.open() as self._pool:
        self._pool.start_soon(func())

    del self._file

    self.experiment.has_report = True
    self.experiment.save()

  def receive(self, exec_path: list[int], message: Any):
    current_handle = self._handle

    for exec_key in exec_path:
      current_handle = current_handle._children[exec_key]

    current_handle._program.receive(message)

  def study_block(self, block: BaseBlock):
    return self._owner.study_block(block)


  def export(self):
    if not self._root_entry:
      return None

    return {
      "id": self.id,
      "initialAnalysis": self._initial_analysis.export(),
      "location": self._root_entry.export(),
      "masterAnalysis": self._master_analysis.export(),
      "protocol": self.protocol.export(),
      "startDate": (self.start_time * 1000)
    }


  def update(self):
    if False:
      for index, trace in enumerate(self._update_traces):
        print(f"Trace {index}")

        for line in trace.format():
          print(line, end=str())

    self._update_traces.clear()

    analysis = MasterAnalysis()
    changes = list[TreeChange]()
    user_significant = False

    def update_handle(handle: ProgramHandle, parent_entry: Optional[ProgramHandleEntry] = None, entry_id: int = 0, entry_path: list[int] = list()):
      nonlocal user_significant

      if parent_entry:
        current_entry = parent_entry.children.get(entry_id)
      else:
        current_entry = self._root_entry

      if not current_entry:
        assert handle._location
        assert handle._updated_term

        current_entry = ProgramHandleEntry(
          index=self._entry_counter.new(),
          location=handle._location,
          start_time=time.time()
        )

        if parent_entry:
          parent_entry.children[entry_id] = current_entry
        else:
          self._root_entry = current_entry

        changes.append(TreeAdditionChange(
          block_child_id=entry_id,
          location=handle._location,
          parent_index=(parent_entry.index if parent_entry else 0)
        ))

      elif handle._updated_location:
        assert handle._location
        current_entry.location = handle._location

        changes.append(TreeUpdateChange(
          index=current_entry.index,
          location=handle._location
        ))

      # Collect errors here for their order to be correct.
      analysis.add_runtime(handle._analysis, entry_path, 0)

      for child_id, child_handle in list(handle._children.items()):
        update_handle(child_handle, current_entry, child_id, [*entry_path, child_id])

      # Recalculate the term of this handle
      # This must be done after updating children as their term needs to be correct.
      if handle._updated_term:
        handle._calculate_term()
        assert handle._term_info
        current_entry.term, current_entry.children_terms = handle._term_info

      if handle._consumed:
        self._entry_counter.delete(current_entry.index)

        changes.append(TreeRemovalChange(
          index=current_entry.index
        ))

        if isinstance(parent_handle := handle._parent, ProgramHandle):
          del parent_handle._children[entry_id]

        if parent_entry:
          del parent_entry.children[entry_id]
        else:
          self._root_entry = None

      user_significant = user_significant or (handle._updated_location and (not handle._consumed))

      handle._analysis = RuntimeAnalysis()
      handle._updated_location = False

    update_handle(self._handle)
    self._master_analysis += analysis

    if self._update_callback and user_significant:
      self._update_callback()

    event = ExperimentReportEvent(
      analysis=analysis,
      changes=changes,
      time=time.time()
    )

    comserde.dump(event, self._file)

    # from pprint import pprint
    # pprint(changes)

    # for change in changes:
    #   print(change.serialize())

    # print('---')
    # print(f"useful={user_significant}")
    # print(update_entry.format())
    # print()
    # print(self._root_entry and self._root_entry.format_hierarchy())
    # print()
    # print(analysis)
    # pprint(changes)
    # data = comserde.dumps(changes, list[TreeChange])
    # pprint(comserde.loads(data, list[TreeChange]))
    # print('---')

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
class ProgramHandleEntry(HierarchyNode):
  children_terms: dict[int, Term] = field(default_factory=dict)
  children: dict[int, Self] = field(default_factory=dict)
  index: int
  location: Exportable
  start_time: float
  term: Term = field(default_factory=DurationTerm.unknown)

  def __get_node_name__(self):
    return f"[{self.index}] " + (f"\x1b[37m{self.location!r}\x1b[0m")

  def __get_node_children__(self):
    return self.children.values()

  def export(self):
    return {
      "children": {
        child_id: child.export() for child_id, child in self.children.items()
      },
      "childrenTerms": { child_id: child_term.export() for child_id, child_term in self.children_terms.items() },
      "startDate": (self.start_time * 1000),
      "term": self.term.export(),
      **self.location.export()
    }


@dataclass
class Mark:
  term: Term
  children_marks: dict[int, Optional[Self]] # None = Child will be reset
  children_offsets: dict[int, Optional[Term]] # None = Use existing location

  def export(self):
    return {
      "term": self.term.export(),
      "childrenMarks": { child_id: (child_mark and child_mark.export()) for child_id, child_mark in self.children_marks.items() },
      "childrenOffsets": { child_id: (child_offset and child_offset.export()) for child_id, child_offset in self.children_offsets.items() }
    }

class ProgramHandle:
  def __init__(self, parent: 'Master | ProgramHandle', id: int):
    self._children = dict[int, ProgramHandle]()
    self._id = id
    self._parent = parent
    self._program: BaseProgram

    self._analysis = RuntimeAnalysis()
    self._location: Optional[Exportable] = None
    self._term_info: Optional[tuple[Term, dict[int, Term]]] = None

    self._consumed = False
    self._failed = False
    self._locked = False
    self._updated_location = False
    self._updated_term = True

    self.context: EvalContext

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
    self._updated_location = True

    if (not self._locked) and lock:
      self._locked = True
      self.master._update_lock_depth += 1

      if self.master._update_handle:
        self.master._update_handle.cancel()
        self.master._update_handle = None
    else:
      self.master.update_soon()

  def set_analysis(self, analysis: DiagnosticAnalysis):
    self._analysis += analysis
    self.master.update_soon()

  def set_term(self):
    self._updated_term = True
    current_handle = self

    while isinstance(current_handle := current_handle._parent, ProgramHandle):
      current_handle._updated_term = True

    self.master.update_soon()

  def _calculate_term(self):
    self._updated_term = False

    current_children_terms = {
      child_id: child_handle._term_info[0] for child_id, child_handle in self._children.items() if child_handle._term_info
    }

    self._term_info = self._program.term_info(current_children_terms)

  def set_location(self, location: Exportable, /):
    self._location = location
    self._updated_location = True

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
    self._handle.context = EvalContext(stack, cwd_path=self._handle.master.experiment.path)

    await self._program.run(point, stack)

    for child_handle in self._handle._children.values():
      assert child_handle._consumed

    self._handle._consumed = True

    del self._handle.context

  def swap(self, block: BaseBlock):
    if not self._program.study(block):
      return False

    self._program.swap(block)

    return True

  def study_block(self, block: BaseBlock):
    return self._program.study_block(block)


__all__ = [
  'Mark',
  'Master',
  'ProgramHandle',
  'ProgramOwner'
]

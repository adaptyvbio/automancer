import asyncio
from dataclasses import dataclass
import traceback
from typing import Any, AsyncGenerator, Callable, Optional

from ..units.base import BaseRunner

from .parser import BlockProgram, BlockState, FiberProtocol
from ..chip import Chip
from ..devices.claim import ClaimSymbol
from ..util.iterators import DynamicParallelIterator


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


@dataclass
class StateLocation:
  unit_locations: dict[str, Any]

  def export(self):
    return {
      namespace: (unit_location and unit_location.export()) for namespace, unit_location in self.unit_locations.items()
    }


class Master:
  def __init__(self, protocol: FiberProtocol, /, chip: Chip):
    self.chip = chip
    self.protocol = protocol

    self._program: BlockProgram
    self._location: Any

    self._pause_future: Optional[asyncio.Future] = None

  def halt(self):
    self._program.halt()

  def pause(self):
    self._pause_future = asyncio.Future()
    self._program.pause()

  async def wait_pause(self):
    self.pause()

    assert self._pause_future
    await self._pause_future

  def resume(self):
    self._program.resume()

  async def run(self, initial_location = None):
    symbol = ClaimSymbol()

    self._program = self.protocol.root.Program(block=self.protocol.root, master=self, parent=self)

    async for event in self._program.run(initial_location, symbol):
      yield event

      if event.stopped and self._pause_future:
        self._pause_future.set_result(True)
        self._pause_future = None

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
          if event.location:
            self._location = event.location

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

  def create_instance(self, state: BlockState, *, notify: Callable, symbol: ClaimSymbol):
    runners = { namespace: runner for namespace, runner in self.chip.runners.items() if state.get(namespace) }
    return StateInstanceCollection(runners, notify=notify, symbol=symbol)

  def export(self):
    return {
      "location": self._location.export(),
      "protocol": self.protocol.export()
    }


class StateInstanceCollection:
  def __init__(self, runners: dict[str, BaseRunner], *, notify: Callable, symbol: ClaimSymbol):
    self._applied = False
    self._notify = notify
    self._runners = runners
    self._instances = { namespace: runner.StateInstance(runner, notify=(lambda event, namespace = namespace: self._notify_unit(namespace, event)), symbol=symbol) for namespace, runner in runners.items() if runner.StateInstance }
    self._location: StateLocation

  @property
  def applied(self):
    return self._applied

  def _notify_unit(self, namespace: str, event: Any):
    self._location.unit_locations[namespace] = event
    self._notify(self._location)

  def apply(self, state: Any, *, resume: bool):
    self._applied = True
    self._location = StateLocation({ namespace: instance.apply(state[namespace], resume=resume) for namespace, instance in self._instances.items()})
    return self._location

  def update(self, state: Any):
    ...

  async def suspend(self):
    self._applied = False
    await asyncio.gather(*[instance.suspend() for namespace, instance in self._instances.items()])

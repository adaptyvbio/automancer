import asyncio
from dataclasses import dataclass
import traceback
from typing import TYPE_CHECKING, Any, AsyncGenerator, Callable, Optional

from .process import ProgramExecEvent
from .eval import EvalStack
from ..units.base import BaseRunner
from .parser import BlockProgram, BlockState, FiberProtocol
from ..chip import Chip
from ..devices.claim import ClaimSymbol
from ..util.iterators import DynamicParallelIterator

if TYPE_CHECKING:
  from ..host import Host


@dataclass
class StateLocation:
  unit_locations: dict[str, Any]

  def export(self):
    return {
      namespace: (unit_location and unit_location.export()) for namespace, unit_location in self.unit_locations.items()
    }


class Master:
  def __init__(self, protocol: FiberProtocol, /, chip: Chip, *, host: 'Host'):
    self.chip = chip
    self.host = host
    self.protocol = protocol

    self._events = list[ProgramExecEvent]()
    self._program: BlockProgram
    self._location: Any

    self._done_future: Optional[asyncio.Future] = None
    self._pause_future: Optional[asyncio.Future] = None

  def halt(self):
    self._program.halt()

  def pause(self):
    self._pause_future = asyncio.Future()
    self._program.pause()

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

  async def run(self, initial_location = None):
    symbol = ClaimSymbol()

    self._program = self.protocol.root.Program(block=self.protocol.root, master=self, parent=self)

    from random import random

    runtime_stack = {
      self.protocol.global_env: dict(random=random)
    }

    async for event in self._program.run(initial_location, None, runtime_stack, symbol):
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
          self._events.append(event)

          if event.location:
            self._location = event.location

          if start_future:
            start_future.set_result(None)
            start_future = None
          else:
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
    return StateInstanceCollection(runners, notify=notify, stack=stack, symbol=symbol)

  def export(self):
    return {
      "location": self._location.export(),
      "protocol": self.protocol.export()
    }


class StateInstanceCollection:
  def __init__(self, runners: dict[str, BaseRunner], *, notify: Callable, stack: EvalStack, symbol: ClaimSymbol):
    self._applied = False
    self._notify = notify
    self._runners = runners
    self._instances = { namespace: runner.StateInstance(runner, notify=(lambda event, namespace = namespace: self._notify_unit(namespace, event)), stack=stack, symbol=symbol) for namespace, runner in runners.items() if runner.StateInstance }
    self._location: StateLocation
    self._state: BlockState

  @property
  def applied(self):
    return self._applied

  def _notify_unit(self, namespace: str, event: Any):
    self._location.unit_locations[namespace] = event
    self._notify(self._location)

  def prepare(self, state: BlockState):
    for namespace, instance in self._instances.items():
      instance.prepare(state[namespace])

  async def apply(self, state: BlockState, *, resume: bool):
    self._applied = True
    self._state = state
    self._location = StateLocation({})

    for namespace, instance in self._instances.items():
      self._location.unit_locations[namespace] = await instance.apply(state[namespace], resume=resume)

    return self._location

  def update(self, state: BlockState):
    assert self._applied

    self._location = StateLocation({ namespace: instance.update(state[namespace]) for namespace, instance in self._instances.items()})
    return self._location

  async def suspend(self):
    assert self._applied

    self._applied = False
    await asyncio.gather(*[instance.suspend() for namespace, instance in self._instances.items()])

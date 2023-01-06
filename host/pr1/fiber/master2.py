import asyncio
from dataclasses import dataclass
import traceback
from typing import Any, AsyncGenerator, Callable, Optional

from ..units.base import BaseRunner
from .parser import BlockProgram, BlockState, FiberProtocol
from ..chip import Chip
from ..devices.claim import ClaimSymbol
from ..util.iterators import DynamicParallelIterator


@dataclass
class StateLocation:
  unit_locations: dict[str, Any]

  def export(self):
    return {
      namespace: (unit_location and unit_location.export()) for namespace, unit_location in self.unit_locations.items()
    }


class Master:
  def __init__(self, protocol: FiberProtocol, /, chip: Chip, *, host):
    self.chip = chip
    self.host = host
    self.protocol = protocol

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

    async for event in self._program.run(initial_location, None, symbol):
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

        assert self._done_future
        self._done_future.set_result(None)
      except Exception:
        traceback.print_exc()

    start_future = asyncio.Future()

    self._done_future = asyncio.Future()
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
    self._state: BlockState

  @property
  def applied(self):
    return self._applied

  def _notify_unit(self, namespace: str, event: Any):
    self._location.unit_locations[namespace] = event
    self._notify(self._location)

  def apply(self, state: BlockState, *, resume: bool):
    self._applied = True
    self._location = StateLocation({ namespace: instance.apply(state[namespace], resume=resume) for namespace, instance in self._instances.items()})
    self._state = state

    return self._location

  def update(self, state: BlockState):
    assert self._applied

    self._location = StateLocation({ namespace: instance.update(state[namespace]) for namespace, instance in self._instances.items()})
    return self._location

  async def suspend(self):
    assert self._applied

    self._applied = False
    await asyncio.gather(*[instance.suspend() for namespace, instance in self._instances.items()])


# class StateInstanceCollection:
#   def __init__(self, runners: dict[str, BaseRunner], *, notify: Callable, parent: Optional['StateInstanceCollection'], symbol: ClaimSymbol):
#     self._applied = False
#     self._notify = notify
#     self._runners = runners
#     self._instances = { namespace: runner.StateInstance(runner, notify=(lambda event, namespace = namespace: self._notify_unit(namespace, event)), symbol=symbol) for namespace, runner in runners.items() if runner.StateInstance }
#     self._location: StateLocation
#     self._parent = parent
#     self._suspended = False

#     self._final_state: Any
#     self._full_state: Any
#     self._reduced_state: Any

#   @property
#   def applied(self):
#     return self._applied

#   def _notify_unit(self, namespace: str, event: Any):
#     self._location.unit_locations[namespace] = event
#     self._notify(self._location)

#   def apply(self, state: Any, *, resume: bool):
#     self._full_state = state

#     # self._applied = True
#     # self._location = StateLocation({ namespace: instance.apply(state[namespace], resume=resume) for namespace, instance in self._instances.items()})
#     # return self._location

#   def reduce(self):
#     if self._parent:
#       self._parent.reduce()
#       self._parent._final_state, self._reduced_state = self._parent._reduced_state & self._full_state
#     else:
#       self._reduced_state = self._full_state

#   def update(self, state: Any):
#     ...

#   async def suspend(self):
#     self._applied = False
#     await asyncio.gather(*[instance.suspend() for namespace, instance in self._instances.items()])

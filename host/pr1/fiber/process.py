import datetime
from enum import IntEnum
from typing import Any, AsyncIterator, Generic, Optional, Protocol, TypeVar
from typing import TYPE_CHECKING

from .parser import BlockState
from ..util.decorators import debug

if TYPE_CHECKING:
  from .segment import SegmentProgram


DateLike = datetime.datetime | float
DurationLike = datetime.timedelta | float

def transform_duration(value: DurationLike, /) -> float:
  return value.total_seconds() if isinstance(value, datetime.timedelta) else value

class ProgramExecDuration:
  def __init__(self, value: DurationLike, /, resolution: DurationLike = 0.0):
    self.resolution = resolution
    self.value = value

  def export(self):
    return {
      "resolution": transform_duration(self.resolution),
      "value": transform_duration(self.value)
    }


# class ProgramExecMode(IntEnum):
#   Normal = 0
#   Paused = 1
#   Halted = 2
#   # Done = 5


class ProgramState(Protocol):
  def export(self) -> dict:
    ...

T = TypeVar('T', bound=ProgramState)

@debug
class ProgramExecEvent(Generic[T]):
  def __init__(
    self,
    duration: Optional[ProgramExecDuration | DurationLike] = None,
    error: Optional[Exception] = None,
    pausable: Optional[bool] = None,
    state: Optional[T] = None,
    stopped: bool = False,
    time: Optional[float] = None,
    **kwargs
  ):
    # self.duration = duration
    # self.error = error
    # self.pausable = pausable
    self.state = state
    self.stopped = stopped
    self.time = time


class Process(Protocol[T]):
  def cancel(self):
    ...

  def halt(self):
    ...

  def jump(self, point: Any):
    ...

  def pause(self):
    ...

  def resume(self):
    ...

  def run(self, block_state: BlockState, initial_state: Optional[T]) -> AsyncIterator[ProgramExecEvent[T]]:
    ...

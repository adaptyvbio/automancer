from dataclasses import dataclass
import datetime
from enum import IntEnum
from typing import Any, AsyncIterator, Generic, Optional, Protocol, TypeVar
from typing import TYPE_CHECKING

from .parser import BlockState
from ..util.decorators import debug
from ..util.misc import Exportable

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


T = TypeVar('T', bound=Exportable)

@dataclass(kw_only=True)
class ProgramExecEvent(Generic[T]):
  location: Optional[T] = None # Optional?
  partial: bool = False
  state_terminated: bool = False
  terminated: bool = False
  stopped: bool = False
  time: Optional[float] = None

@dataclass(kw_only=True)
class ProcessExecEvent:
  duration: Optional[ProgramExecDuration | DurationLike] = None
  location: Exportable
  pausable: bool = False
  stopped: bool = False
  terminated: bool = False
  time: Optional[float] = None


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

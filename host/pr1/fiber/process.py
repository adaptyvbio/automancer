import datetime
from typing import AsyncIterator, Generic, Optional, Protocol, TypeVar
from typing import TYPE_CHECKING

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


class ProgramState(Protocol):
  def export(self) -> dict:
    ...

T = TypeVar('T', bound=ProgramState)

@debug
class ProgramExecInfo(Generic[T]):
  def __init__(
    self,
    duration: Optional[ProgramExecDuration | DurationLike] = None,
    error: Optional[Exception] = None,
    state: Optional[T] = None,
    stopped: bool = False,
    time: Optional[DateLike] = None
  ):
    self.duration = duration
    self.error = error
    self.state = state
    self.stopped = stopped
    self.time = time


class Process(Protocol[T]):
  def cancel(self):
    ...

  def pause(self):
    ...

  def run(self, initial_state: Optional[T]) -> AsyncIterator[ProgramExecInfo[T]]:
    ...

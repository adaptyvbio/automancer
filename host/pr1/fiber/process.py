import datetime
from typing import AsyncIterator, Generic, Optional, Protocol, TypeVar
from typing import TYPE_CHECKING

if TYPE_CHECKING:
  from .segment import SegmentProgram


DateLike = datetime.datetime | float
DurationLike = datetime.timedelta | float

def transform_duration(value: DurationLike, /) -> float:
  return value.total_seconds() if isinstance(value, datetime.timedelta) else value

class ProcessExecDuration:
  def __init__(self, value: DurationLike, /, resolution: DurationLike = 0.0):
    self.resolution = resolution
    self.value = value

  def export(self):
    return {
      "resolution": transform_duration(self.resolution),
      "value": transform_duration(self.value)
    }


class BaseProcessState(Protocol):
  def export(self) -> dict:
    ...

T = TypeVar('T', bound=BaseProcessState)

class ProcessExecInfo(Generic[T]):
  def __init__(
    self,
    duration: Optional[ProcessExecDuration | DurationLike] = None,
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

class ProcessExecStatus:
  def __init__(self, program: 'SegmentProgram', /):
    self._program = program

  @property
  def paused(self):
    pass

  async def wait(self):
    pass


class Process(Protocol[T]):
  def cancel(self):
    ...

  def pause(self):
    ...

  def run(self, status: ProcessExecStatus, initial_state: Optional[T]) -> AsyncIterator[ProcessExecInfo[T]]:
    ...

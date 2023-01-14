from dataclasses import dataclass
import datetime
from enum import IntEnum
from typing import Any, AsyncIterator, Generic, Optional, Protocol, TypeVar
from typing import TYPE_CHECKING

from ..error import MasterError
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


T = TypeVar('T', bound=Exportable)

@dataclass(kw_only=True)
class ProgramExecEvent(Generic[T]):
  errors: Optional[list[Any]] = None
  location: Optional[T] = None
  partial: bool = False
  state_terminated: bool = False
  terminated: bool = False
  stopped: bool = False
  time: Optional[float] = None

  def inherit(
    self,
    *,
    errors: Optional[list[Any]],
    location: Optional[T],
    terminated: bool = False
  ):
    return type(self)(
      errors=((self.errors or list()) + (errors or list())),
      location=location,
      partial=self.partial,
      state_terminated=self.state_terminated,
      terminated=terminated,
      stopped=self.stopped,
      time=self.time
    )


@dataclass(kw_only=True)
class BaseProcessEvent:
  errors: Optional[list[MasterError]] = None
  location: Optional[Exportable] = None
  time: Optional[float] = None

@dataclass(kw_only=True)
class ProcessExecEvent(BaseProcessEvent):
  duration: Optional[ProgramExecDuration | DurationLike] = None
  pausable: Optional[bool] = None

@dataclass(kw_only=True)
class ProcessPauseEvent(BaseProcessEvent):
  duration: Optional[ProgramExecDuration | DurationLike] = None

@dataclass(kw_only=True)
class ProcessFailureEvent(BaseProcessEvent):
  error: MasterError

@dataclass(kw_only=True)
class ProcessTerminationEvent(BaseProcessEvent):
  pass

ProcessEvent = ProcessExecEvent | ProcessFailureEvent | ProcessPauseEvent | ProcessTerminationEvent


class Process(Protocol[T]):
  def __init__(self, process_data: Any, /, runner: Any):
    pass

  def halt(self) -> Optional[bool]:
    return None

  def jump(self, point: Any):
    ...

  def pause(self):
    ...

  def resume(self):
    ...

  def run(self, block_state: BlockState, initial_state: Optional[T]) -> AsyncIterator[ProgramExecEvent[T]]:
    ...

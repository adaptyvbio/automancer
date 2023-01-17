from dataclasses import dataclass, field
import datetime
from enum import IntEnum
from typing import Any, AsyncIterator, Generic, Optional, Protocol, TypeVar
from typing import TYPE_CHECKING

from ..error import Error, MasterError
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
  errors: list[MasterError] = field(default_factory=list)
  location: Optional[T] = None
  partial: bool = False
  state_terminated: bool = False
  terminated: bool = False
  stopped: bool = False
  time: Optional[float] = None

  def inherit(
    self,
    *,
    errors: Optional[list[Error]] = None,
    key: Optional[Any] = None,
    location: Optional[T],
    state_terminated: Optional[bool] = None,
    stopped: Optional[bool] = None,
    terminated: bool = False
  ):
    for err in self.errors:
      err.path.insert(0, key)

    return type(self)(
      # The child errors (self.errors) are considered to happen after the parent errors (errors), so they are added last.
      errors=([error.as_master(time=self.time) for error in (errors or list())] + self.errors),
      location=location,
      partial=self.partial,
      state_terminated=(state_terminated if state_terminated is not None else self.state_terminated),
      terminated=terminated,
      stopped=(stopped if stopped is not None else self.stopped),
      time=self.time
    )


@dataclass(kw_only=True)
class BaseProcessEvent:
  errors: list[Error] = field(default_factory=list)
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
  error: Optional[Error] = None

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

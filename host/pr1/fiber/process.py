import datetime
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Optional, Protocol, TypeVar

from ..error import Error
from ..master.analysis import MasterAnalysis, MasterError
from ..util.misc import Exportable
from .eval import EvalStack


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


@dataclass(kw_only=True)
class ProgramExecEvent:
  analysis: MasterAnalysis = field(default_factory=MasterAnalysis)
  location: Optional[Exportable] = None
  time: Optional[float] = None


@dataclass(kw_only=True)
class BaseProcessEvent:
  analysis: MasterAnalysis = field(default_factory=MasterAnalysis)
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
  error: Optional[MasterError] = None

@dataclass(kw_only=True)
class ProcessTerminationEvent(BaseProcessEvent):
  pass

ProcessEvent = ProcessExecEvent | ProcessFailureEvent | ProcessPauseEvent | ProcessTerminationEvent


T = TypeVar('T', bound=Exportable, contravariant=True)

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

  def run(self, initial_point: Optional[T], *, stack: EvalStack) -> AsyncIterator[ProcessEvent]:
    ...

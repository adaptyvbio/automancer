from dataclasses import dataclass
import datetime
import math


DateLike = datetime.datetime | float
DurationLike = datetime.timedelta | float

@dataclass
class ApproximativeETA:
  value: DurationLike
  resolution: DurationLike

DurationETA = ApproximativeETA | DurationLike


def export_eta(value: float, /):
  return -1 if math.isnan(value) else value

def normalize_duration_eta(value: DurationETA, /) -> float:
  match value:
    case datetime.timedelta():
      return value.total_seconds()
    case float():
      return value
    case ApproximativeETA(value, resolution):
      return normalize_duration_eta(value)


__all__ = [
  'ApproximativeETA',
  'DateLike',
  'DurationLike',
  'DurationETA'
]

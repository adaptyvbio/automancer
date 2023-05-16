from typing import Optional
import numpy as np
from pr1.units.base import BaseMasterRunner

from . import namespace


class Runner(BaseMasterRunner):
  def __init__(self, master):
    self._executor = master.host.executors[namespace]
    self._master = master

    self._chip_count = 1
    self._points: Optional[np.ndarray] = None
    self._points_path = master.chip.dir / namespace / "points.json"

  async def command(self, data, /):
    match data["type"]:
      case "queryPoints":
        self._points = await self._executor.query(chip_count=self._chip_count)

        self._points_path.parent.mkdir(exist_ok=True, parents=True)
        np.save(self._points_path.open("wb"), self._points)

      case "setChipCount":
        self._chip_count = data["value"]

        if (self._points is not None) and (self._points.shape[2] != self._chip_count):
          self._points = None
          self._points_path.unlink()

  def export(self):
    return {
      "chipCount": self._chip_count,
      "pointsSaved": (self._points is not None)
    }

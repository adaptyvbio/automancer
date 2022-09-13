import numpy as np
from pr1.units.base import BaseRunner

from . import logger, namespace


class Runner(BaseRunner):
  def __init__(self, chip, host):
    self._chip = chip
    self._host = host
    self._executor = self._host.executors[namespace]

    self._chip_count = None
    self._points = None
    self._points_path = self._chip.dir / namespace / "points.json"

  async def command(self, data):
    match data["type"]:
      case "queryPoints":
        self._points = await self._executor.query(chip_count=self._chip_count)

        self._points_path.parent.mkdir(exist_ok=True, parents=True)
        np.save(self._points_path.open("wb"), self._points)

      case "set":
        self._chip_count = data["chipCount"]
        self._chip.update_runners(namespace)

        if (self._points is not None) and (self._points.shape[2] != self._chip_count):
          self._points = None
          self._points_path.unlink()
  
  def get_state(self):
    return dict()
  
  def export_state(self, state):
    return dict()
  
  def import_state(self, data_state):
    return dict()

  async def run_process(self, segment, seg_index, state):
    seg = segment[namespace]

    if self._points is None:
      raise Exception("Missing points")
    
    await self._executor.capture(
      chip_count=self._chip_count,
      exposure=seg['exposure'],
      objective=seg['objective'],
      optconf=seg['optconf'],
      output_path=(self._chip.dir / seg['output_path']),
      points=self._points
    )

  def create(self):
    self._chip_count = 1

  def export(self):
    return {
      "chipCount": self._chip_count,
      "pointsSaved": (self._points is not None)
    }

  def serialize(self):
    return (self._chip_count, )

  def unserialize(self, state):
    self._chip_count, = state

    try:
      with self._points_path.open("rb") as points_file:
        self._points = np.load(points_file)
    except FileNotFoundError:
      pass

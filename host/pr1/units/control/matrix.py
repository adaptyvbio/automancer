from collections import namedtuple

from . import namespace
from .runner import BinaryPermutation
from ..base import BaseMatrix


Valve = namedtuple("Valve", ['host_valve_index'])


class Matrix(BaseMatrix):
  def __init__(self):
    self._chip = None
    self._host = None

    self.model_id = None
    self.valves = None

  def initialize(self, *, chip, host):
    self._chip = chip
    self._host = host

  @property
  def model(self):
    return self._host.executors[namespace].models[self.model_id] if self.model_id else None

  @property
  def permutation(self):
    return BinaryPermutation([valve.host_valve_index for valve in self.valves]) if self.valves is not None else None

  def update(self, update_data):
    self.model_id = update_data["modelId"]

    if self.model_id:
      self.valves = [Valve(
        host_valve_index=(update_data["valves"][index]["hostValveIndex"] if update_data["valves"] else None)
      ) for index in range(len(self.model.channels))]
    else:
      self.valves = None

  def export(self):
    return {
      "modelId": self.model_id,
      "valves": [{
        "hostValveIndex": valve.host_valve_index
      } for valve in self.valves] if self.valves is not None else None
    }

  def __getstate__(self):
    return (self.model_id, self.valves)

  def __setstate__(self, state):
    self.model_id, self.valves = state

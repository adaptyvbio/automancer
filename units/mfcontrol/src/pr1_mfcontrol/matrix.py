from collections import namedtuple

from pr1.units.base import BaseMatrix

from . import namespace
from .model import Model
# from .runner import BinaryPermutation


Valve = namedtuple("Valve", ['host_valve_index'])


class Matrix(BaseMatrix):
  def __init__(self, chip, host):
    self._chip = chip
    self._host = host

    self.model = None
    self.valves = None

  # @property
  # def model(self):
  #   return self._host.executors[namespace].models[self.model_id] if self.model_id else None

  @property
  def permutation(self):
    return BinaryPermutation([valve.host_valve_index for valve in self.valves]) if self.valves is not None else None

  def update(self, update_data):
    if "modelId" in update_data:
      model_id = update_data["modelId"]

      if model_id:
        self.model = self._host.executors[namespace].models[model_id]
        self.valves = [Valve(host_valve_index=None) for index in range(len(self.model.channels))]
      else:
        self.model = None
        self.valves = None

    if "valves" in update_data:
      self.valves = [Valve(
        host_valve_index=update_data["valves"][index]["hostValveIndex"]
      ) for index in range(len(self.model.channels))]
      print(self.valves)

  def export(self):
    return {
      "model": (self.model.export() if self.model else None),
      "valves": [{
        "hostValveIndex": valve.host_valve_index
      } for valve in self.valves] if self.valves is not None else None
    }

  def serialize(self):
    return ((self.model.serialize() if self.model else None), self.valves)

  def unserialize(self, state):
    model, self.valves = state

    if model:
      self.model = Model.unserialize(model)

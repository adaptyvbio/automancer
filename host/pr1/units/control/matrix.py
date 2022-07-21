from collections import namedtuple

from . import namespace
from .runner import BinaryPermutation
from ..base import BaseMatrix
from ..microfluidics import namespace as mf_namespace


Valve = namedtuple("Valve", ['host_valve_index'])


class Matrix(BaseMatrix):
  def __init__(self):
    self.model_id = None
    self.valves = None

    self._set_permutation()

  def _set_permutation(self):
    self.permutation = BinaryPermutation([valve.host_valve_index for valve in self.valves]) if self.valves is not None else None

  def export(self):
    return {
      "valves": [{
        "hostValveIndex": valve.host_valve_index
      } for valve in self.valves] if self.valves is not None else None
    }

  def commit(self, *, chip, host):
    model_id = chip.matrices[mf_namespace].model_id

    if model_id != self.model_id:
      self.model_id = model_id

      if model_id:
        model = host.executors[mf_namespace].models[model_id]
        self.valves = [Valve(
          host_valve_index=None
        ) for _ in range(len(model.channels))]
      else:
        self.valves = None

      self._set_permutation()

  def update(self, update_data):
    self.valves = [Valve(
      host_valve_index=update_data["valves"][index]["hostValveIndex"]
    ) for index in range(len(update_data["valves"]))]

    self._set_permutation()

  def load(sheet):
    return Matrix(
      sheet,
      valves=[Valve(
        aliases=list(),
        host_valve_index=None
      ) for _ in range(len(sheet.valves))]
    )

  # def unserialize(data, *, sheet):
  #   return Matrix(sheet, valves=[Valve(**valve) for valve in data['valves']])

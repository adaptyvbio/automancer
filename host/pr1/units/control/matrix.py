from collections import namedtuple

from .runner import BinaryPermutation


Valve = namedtuple("Valve", ['aliases', 'host_valve_index'])


class Matrix:
  def __init__(self, sheet, valves):
    self._sheet = sheet
    self.valves = valves

    # self.valves[0] = Valve(aliases=list(), host_valve_index=4)
    # self.valves[1] = Valve(aliases=list(), host_valve_index=5)

    self._set_permutation()

  def _set_permutation(self):
    self.permutation = BinaryPermutation([valve.host_valve_index for valve in self.valves])

  def export(self):
    return {
      "valves": [{
        "aliases": valve.aliases,
        "hostValveIndex": valve.host_valve_index
      } for valve in self.valves]
    }

  def serialize(self):
    return {
      'valves': [valve._asdict() for valve in self.valves]
    }

  def update(self, data):
    self.valves = [Valve(
      aliases=data["valves"][index]["aliases"],
      host_valve_index=data["valves"][index]["hostValveIndex"]
    ) for index in range(len(self._sheet.valves))]

    self._set_permutation()

  def load(sheet):
    return Matrix(
      sheet,
      valves=[Valve(
        aliases=list(),
        host_valve_index=None
      ) for _ in range(len(sheet.valves))]
    )

  def unserialize(data, *, sheet):
    return Matrix(sheet, valves=[Valve(**valve) for valve in data['valves']])

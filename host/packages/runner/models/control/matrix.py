from collections import namedtuple


Valve = namedtuple("Valve", ["aliases", "host_valve_index"])


class Matrix:
  def __init__(self, sheet, valves):
    self._sheet = sheet
    self.valves = valves

  def export(self):
    return {
      "valves": [{
        "aliases": valve.aliases,
        "hostValveIndex": valve.host_valve_index
      } for valve in self.valves]
    }

  def update(self, data):
    self.valves = [Valve(
      aliases=data["valves"][index]["aliases"],
      host_valve_index=data["valves"][index]["hostValveIndex"]
    ) for index in range(len(self._sheet.valves))]

  def load(sheet):
    return Matrix(
      sheet,
      valves=[Valve(
        aliases=list(),
        host_valve_index=None
      ) for _ in range(len(sheet.valves))]
    )

    # sheet,
    # valves=[Valve(
    #   aliases=(data["valves"][index]["aliases"] if data else list()),
    #   host_valve_index=(data["valves"][index]["hostValveIndex"] if data else None)
    # ) for index in range(len(sheet.valves))]

    # valves=[Valve(
    #   aliases=list(),
    #   host_valve_index=valve["hostValveIndex"]
    # ) for valve in data["valves"]]

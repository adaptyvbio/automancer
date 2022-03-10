from collections import namedtuple
from optparse import Option

from ...util.parser import check_identifier, check_identifier_alt
from ...util.schema import And, Array, List, Optional, Schema, Use


Valve = namedtuple("Valve", ["alias", "group", "id", "inverse", "name", "schematic"])
ValveGroup = namedtuple("ValveGroup", ["color", "id", "inverse", "name", "valve_ids"])


class Sheet:
  def __init__(self, data, *, dir):
    schema = Schema({
      "groups": Optional(List({
        "color": Optional(str),
        "id": And(str, Use(check_identifier)),
        "name": Optional(str),
        "inverse": Optional(bool)
      })),
      "valves": Optional(List({
        "alias": Optional(And(str, Use(check_identifier))),
        "id": str,
        "name": Optional(str),
        "schematic": Optional(Array([int, int]))
      })),
      "schematic": Optional(str)
    })

    schema.validate(data)

    self.groups = dict()

    for data_group in data.get("groups", list()):
      group_id = data_group["id"]

      if group_id in self.groups:
        raise group_id.error(f"Duplicate group with id '{group_id}'")

      self.groups[group_id] = ValveGroup(
        color=data_group.get("color"),
        id=group_id,
        inverse=data_group.get("inverse", False),
        name=data_group.get("name"),
        valve_ids=list()
      )

    # self.valves = [Valve(
    #   group=valve.get('group'),
    #   names=[valve['name'], *valve.get('aliases', list())],
    #   schematic=valve.get('schematic')
    # ) for valve in data.get("valves", list())]

    self.valves = list()

    for data_valve in data.get("valves", list()):
      full_id = data_valve["id"]
      slash_index = full_id.find("/")

      if slash_index < 0:
        raise full_id.error("Invalid valve id")

      group_id = full_id[0:slash_index]

      if not group_id in self.groups:
        raise group_id.error(f"Invalid group id '{group_id}'")

      valve_id = data_valve["id"][(slash_index + 1):]
      check_identifier_alt(valve_id)

      group = self.groups[group_id]

      # if valve_id in group.valve_ids:
      #   raise valve_id.error(f"Duplicate valve id '{group_id}/{valve_id}'")

      group.valve_ids.append(len(self.valves))

      self.valves.append(Valve(
        id=valve_id,
        alias=data_valve.get("alias"),
        group=group,
        inverse=(data_valve.get("inverse", False) != group.inverse),
        name=data_valve.get("name"),
        schematic=data_valve.get("schematic")
      ))


    self.schematic = None

    if "schematic" in data:
      schematic_path = dir / data["schematic"]

      try:
        self.schematic = schematic_path.open().read()
      except FileNotFoundError:
        raise data["schematic"].error(f"Missing file at {schematic_path}")


    self.valve_names = {
      name: index for index, valve in enumerate(self.valves) for name in [
        f"{valve.group.id}/{valve.id}",
        *([valve.alias] if valve.alias else list())
      ]
    }


  def export(self):
    return {
      "groups": [{
        "color": group.color,
        "name": group.name
      } for group in self.groups.values()],
      "valves": [{
        "group": list(self.groups.values()).index(valve.group),
        "names": [valve.name or valve.id],
        "schematic": valve.schematic
      } for valve in self.valves],
      "schematic": self.schematic
    }

  def resolve_valve(self, groups):
    name, range_end, wildcard = groups

    valves = set()

    for target_name, target_index in self._valves_names.items():
      if (
        (wildcard is None) and (target_name == name)
      ) or (
        (range_end is not None) and (target_name >= name) and (target_name <= range_end)
      ) or (
        (wildcard is not None) and target_name.startswith(name) and (len(target_name) > len(name))
      ):
        valves.add(target_index)

    if not valves:
      raise Exception(f"Missing valve '{name}'")

    return valves

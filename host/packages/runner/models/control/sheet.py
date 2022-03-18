from collections import namedtuple
from optparse import Option

from ...util.parser import check_identifier
from ...util.schema import And, List, Optional, ParseType, Schema, Transform, Use


Valve = namedtuple("Valve", ["alias", "diagram_ref", "group", "id", "inverse", "name"])
ValveGroup = namedtuple("ValveGroup", ["id", "inverse", "name", "valve_ids"])


def parse_diagram_ref(value):
  fragments = value.split(",")

  if len(fragments) != 2:
    raise value.error("Invalid diagram reference")

  def it(frag):
    try:
      return int(frag)
    except ValueError:
      raise frag.error("Invalid diagram reference entry")

  return value, [it(frag) for frag in fragments]


def parse_valve_id(value):
  slash_index = value.find("/")

  if slash_index < 0:
    raise value.error("Invalid valve id")

  group_id = value[0:slash_index]
  valve_id = value[(slash_index + 1):]

  check_identifier(valve_id, allow_leading_digit=True)

  return (group_id, valve_id)



class Sheet:
  def __init__(self, data, *, dir):
    # -- Validate schema ----------------------------------

    schema = Schema({
      "diagram": Optional(str),
      "groups": Optional(List({
        "id": And(str, Use(check_identifier)),
        "name": Optional(str),
        "inverse": Optional(ParseType(bool))
      })),
      "valves": Optional(List({
        "alias": Optional(And(str, Use(check_identifier))),
        "id": Transform(parse_valve_id, prevalidate=str),
        "inverse": Optional(ParseType(bool)),
        "name": Optional(str),
        "diagram": Optional(Transform(parse_diagram_ref, prevalidate=str))
      }))
    })

    data = schema.transform(data)


    # -- Parse groups -------------------------------------

    self.groups = dict()

    for data_group in data.get("groups", list()):
      group_id = data_group["id"]

      if group_id in self.groups:
        raise group_id.error(f"Duplicate group with id '{group_id}'")

      self.groups[group_id] = ValveGroup(
        id=group_id,
        inverse=data_group.get("inverse", False),
        name=data_group.get("name"),
        valve_ids=list()
      )


    # -- Parse valves -------------------------------------

    self.valves = list()
    self.valve_names = {}

    for data_valve in data.get("valves", list()):
      group_id, valve_id = data_valve["id"]
      group = self.groups.get(group_id)

      if not group:
        raise group_id.error(f"Invalid group id '{group_id}'")

      alias=data_valve.get("alias")
      full_id = f"{group.id}/{valve_id}"
      valve_index = len(self.valves)

      if full_id in self.valve_names:
        raise valve_id.error(f"Duplicate valve id '{valve_id}' in group with id '{group_id}'")

      if alias in self.valve_names:
        raise alias.error(f"Duplicate valve alias '{alias}'")

      diagram_ref = None

      if "diagram" in data_valve:
        diagram_ref_str, diagram_ref = data_valve.get("diagram")

        if diagram_ref and not ("diagram" in data):
          raise diagram_ref_str.error("Invalid reference to missing diagram")

      self.valves.append(Valve(
        alias=alias,
        diagram_ref=diagram_ref,
        group=group,
        id=valve_id,
        inverse=(data_valve.get("inverse", False) != group.inverse),
        name=data_valve.get("name")
      ))

      self.valve_names[full_id] = valve_index

      if alias:
        self.valve_names[alias] = valve_index


    # -- Parse diagram ------------------------------------

    self.diagram = None

    if "diagram" in data:
      diagram_path = dir / data["diagram"]

      try:
        self.diagram = diagram_path.open().read()
      except FileNotFoundError:
        raise data["diagram"].error(f"Missing file at {diagram_path}")


  def export(self):
    return {
      "diagram": self.diagram,
      "groups": [{
        "name": group.name
      } for group in self.groups.values()],
      "valves": [{
        "diagramRef": valve.diagram_ref,
        "group": list(self.groups.values()).index(valve.group),
        "names": [valve.name or valve.id],
      } for valve in self.valves]
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

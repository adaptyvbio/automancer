from collections import namedtuple

from ...util.parser import Identifier, check_identifier
from ...util import schema as sc


Valve = namedtuple("Valve", ['alias', 'default_display', 'default_repr', 'diagram_ref', 'group', 'id', 'inverse', 'name'])
ValveGroup = namedtuple("ValveGroup", ['id', 'inverse', 'name', 'valve_ids'])


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


display_values = ['delta', 'hidden', 'visible']
repr_values = ['flow', 'push', 'unpush', 'waves']

display_partial_schema = {
  'display': sc.Optional(sc.Or(*[sc.Exact(value) for value in display_values])),
  'repr': sc.Optional(sc.Or(*[sc.Exact(value) for value in repr_values]))
}


class Sheet:
  def __init__(self, data, *, dir):

    # -- Validate schema ----------------------------------

    schema = sc.Dict({
      'diagram': sc.Optional(str),
      'groups': sc.Optional(sc.List({
        'id': Identifier(),
        'name': sc.Optional(str),
        'inverse': sc.Optional(sc.ParseType(bool))
      })),
      'valves': sc.Optional(sc.List({
        **display_partial_schema,
        'alias': sc.Optional(Identifier()),
        'diagram': sc.Optional(sc.Transform(parse_diagram_ref, str)),
        'id': sc.Transform(parse_valve_id, str),
        'inverse': sc.Optional(sc.ParseType(bool)),
        'name': sc.Optional(str),
      }))
    }, allow_extra=True)

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

      alias = data_valve.get("alias")
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
        default_display=data_valve.get("display", "visible"),
        default_repr=data_valve.get("repr", "flow"),
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

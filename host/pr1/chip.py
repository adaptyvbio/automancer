import base64
import json
import math
import pickle
import struct
import time
import uuid
from collections import namedtuple
from enum import IntEnum

# flags (4)
#  0 - reserved
#  1 - runner update
#  2 - process
# time (8)
# payload size (4)
message_header_format = "IQI"


class ChipCondition(IntEnum):
  # The chip is fine.
  Ok = 0

  # The chip's corresponding setup is older than the current setup.
  Unsuitable = 1

  # The chip depends on older or missing units.
  Unsupported = 2

  # The chip's definition is too old.
  Obsolete = 3

  # The chip's file is missing or unreadable.
  Corrupted = 4


UnitSpec = namedtuple("UnitSpec", ["hash", "version"])


class BaseChip:
  condition = None

class CorruptedChip(BaseChip):
  condition = ChipCondition.Corrupted

  def __init__(self, *, dir):
    self.dir = dir
    self.id = str(uuid.uuid4())

  def export(self):
    return {
      "id": self.id,
      "condition": self.condition
    }

class ObsoleteChip(BaseChip):
  condition = ChipCondition.Obsolete

  def __init__(self, *, dir, id):
    self.dir = dir
    self.id = id

  def export(self):
    return {
      "id": self.id,
      "condition": self.condition
    }

class PartialChip(BaseChip):
  def __init__(self, *, dir, id, issues):
    self.dir = dir
    self.id = id
    self.issues = issues

  @property
  def condition(self):
    for issue in self.issues:
      if (issue['type'] == 'missing') or (issue['type'] == 'version'):
        return ChipCondition.Unsupported

    return ChipCondition.Unsuitable

  def export(self):
    return {
      "id": self.id,
      "condition": self.condition
    }


class Chip(BaseChip):
  condition = ChipCondition.Ok
  version = 1

  def __init__(self, *, archived, dir, id, unit_list, unit_spec):
    self.archived = archived
    self.dir = dir
    self.id = id
    self.master = None
    self.runners = None
    self.unit_list = unit_list
    self.unit_spec = unit_spec

    self._header_path = (dir / ".header.json")

    self._history_path = (dir / ".history.dat")
    self._history_file = None

  def _push_history(self, *, flags, payload):
    if not self._history_file:
      self._history_file = self._history_path.open("ab", buffering=0)

    header = struct.pack(message_header_format, flags, math.floor(time.time() * 1000), len(payload))
    message = header + payload

    self._history_file.write(message)

  def _save_header(self):
    json.dump({
      'id': self.id,
      'archived': self.archived,
      'runners': {
        namespace: base64.b85encode(runner.serialize_raw()).decode("utf-8") for namespace, runner in self.runners.items()
      },
      'unit_list': self.unit_list,
      'unit_spec': {
        namespace: {
          'hash': unit_spec.hash,
          'version': unit_spec.version
        } for namespace, unit_spec in self.unit_spec.items()
      },
      'version': self.version
    }, self._header_path.open("w"))

  def push_process(self, namespace, data):
    unit_index = self.unit_list.index(namespace)
    self._push_history(flags=2, payload=(struct.pack("H", unit_index) + data))

  def update_runners(self, *namespaces):
    payload = bytearray()

    # for namespace in (namespaces or self.unit_list):
    for namespace in self.unit_list:
      runner = self.runners.get(namespace)

      runner_payload = runner.serialize_raw() if runner else pickle.dumps(None)
      payload.extend(struct.pack("H", len(runner_payload)))
      payload.extend(runner_payload)

    self._push_history(flags=1, payload=payload)
    self._save_header()

  def export(self):
    return {
      "id": self.id,
      "condition": self.condition,
      "archived": self.archived,
      "master": self.master and self.master.export(),
      "runners": {
        namespace: runner.export() for namespace, runner in self.runners.items()
      }
    }


  def create(chips_dir, name, *, host):
    chip_id = str(uuid.uuid4())
    chip_dir = chips_dir / chip_id
    chip_dir.mkdir(exist_ok=True)

    unit_spec = dict()

    for namespace, unit in host.units.items():
      executor = host.executors.get(namespace)
      unit_spec[namespace] = UnitSpec(
        hash=(executor.hash if executor else None),
        version=unit.version
      )

    chip = Chip(
      archived=False,
      id=chip_id,
      dir=chip_dir,
      unit_list=list(unit_spec.keys()),
      unit_spec=unit_spec
    )

    chip.runners = { namespace: unit.Runner(chip=chip, host=host) for namespace, unit in host.units.items() if hasattr(unit, 'Runner') }

    for runner in chip.runners.values():
      runner.create()

    chip._save_header()
    chip.update_runners()

    return chip

  def unserialize(chip_dir, *, host):
    header_path = chip_dir / ".header.json"
    header = json.load(header_path.open())

    if header['version'] != Chip.version:
      return ObsoleteChip(
        dir=chip_dir,
        id=header['id']
      )

    issues = list()

    for namespace, unit_spec in header['unit_spec'].items():
      unit = host.units.get(namespace)

      if not unit:
        issues.append({ 'type': 'missing', 'namespace': namespace })
      elif unit.version != unit_spec['version']:
        issues.append({
          'type': 'version',
          'namespace': namespace,
          'current_version': unit.version,
          'target_version': unit_spec['version']
        })
      elif unit_spec['hash'] is not None:
        executor = host.executors[namespace]

        if executor.hash != unit_spec['hash']:
          issues.append({ 'type': 'hash', 'namespace': namespace })

    if issues:
      return PartialChip(
        dir=chip_dir,
        id=header['id'],
        issues=issues
      )


    # history_path = chip_dir / ".history.dat"
    # history_file = history_path.open("rb")

    # runners = None
    # metadata = None

    # while True:
    #   message_header = history_file.read(struct.calcsize(message_header_format))

    #   if not message_header:
    #     break

    #   flags, message_time, payload_size = struct.unpack(message_header_format, message_header)
    #   print(flags, message_time, payload_size)

    #   if flags == 2:
    #     metadata = pickle.loads(history_file.read(payload_size))

    #   history_file.seek(payload_size, 1)

    chip = Chip(
      archived=header['archived'],
      dir=chip_dir,
      id=header['id'],
      unit_list=header['unit_list'],
      unit_spec={
        namespace: UnitSpec(
          hash=unit_spec['hash'],
          version=unit_spec['version']
        ) for namespace, unit_spec in header['unit_spec'].items()
      }
    )

    chip.runners = {
      name: host.units[name].Runner(chip=chip, host=host) for name in header['runners'].keys()
    }

    for name, runner in chip.runners.items():
      runner.unserialize_raw(base64.b85decode(header['runners'][name].encode("utf-8")))

    return chip

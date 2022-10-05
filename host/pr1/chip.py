import base64
import json
import math
import pickle
import struct
import time
import uuid
from collections import namedtuple
from enum import IntEnum

from . import logger
from .util.misc import log_exception

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

  # The chip is not using all units available.
  Partial = 1

  # The chip is in compatibility mode and read-only. Certain units might be missing.
  Unrunnable = 2

  # The chip is unreadable as it relies on older software.
  Unsupported = 3

  # The chip's file is missing or unreadable.
  Corrupted = 4


class ChipIssue(Exception):
  def export(self):
    return {
      "message": "Unknown issue"
    }

class CorruptedChipError(ChipIssue):
  pass

class DegradedChipRunnerError(ChipIssue):
  condition = ChipCondition.Unrunnable

  def __init__(self, namespace = None):
    self.namespace = namespace

class UnsupportedChipRunnerError(ChipIssue):
  condition = ChipCondition.Unrunnable

  def __init__(self, namespace = None):
    self.namespace = namespace

class UnsupportedChipVersionError(ChipIssue):
  def export(self):
    return {
      "message": "Unsupported chip version"
    }

class ExtraneousUnitError(ChipIssue):
  condition = ChipCondition.Unrunnable

  def __init__(self, namespace):
    self.namespace = namespace

  def export(self):
    return {
      "message": f"""This experiment references the module "{self.namespace}" which is not available on this setup."""
    }

class MissingUnitError(ChipIssue):
  condition = ChipCondition.Partial

  def __init__(self, namespace):
    self.namespace = namespace


class BaseChip:
  condition = None

class UnreadableChip(BaseChip):
  def __init__(self, *, corrupted = False, dir, id = None):
    self.dir = dir
    self.id = id or str(uuid.uuid4())
    self.issues = list()

    self._corrupted = corrupted

  @property
  def condition(self):
    return ChipCondition.Corrupted if self._corrupted else ChipCondition.Unsupported

  def export(self):
    return {
      "id": self.id,
      "condition": self.condition,
      "readable": False,
      "issues": [issue.export() for issue in self.issues]
    }


class Chip(BaseChip):
  version = 2

  def __init__(self, *, dir, id):
    self.dir = dir
    self.id = id
    self.issues = list()
    self.master = None
    self.runners = dict()

    self._header_path = (dir / ".header.json")

    self._history_path = (dir / ".history.dat")
    self._history_file = None

  @property
  def condition(self):
    return max([ChipCondition.Ok, *[issue.condition for issue in self.issues]])

  @property
  def _unit_list(self):
    return list(self.runners.keys())

  def _push_history(self, *, flags, payload):
    if not self._history_file:
      self._history_file = self._history_path.open("ab", buffering=0)

    header = struct.pack(message_header_format, flags, math.floor(time.time() * 1000), len(payload))
    message = header + payload

    self._history_file.write(message)

  def _save_header(self):
    json.dump({
      'id': self.id,
      'runners': {
        namespace: base64.b85encode(runner.serialize_raw()).decode("utf-8") for namespace, runner in self.runners.items()
      },
      'unit_list': self._unit_list,
      'version': self.version
    }, self._header_path.open("w"))

  def push_process(self, namespace, data):
    unit_index = self._unit_list.index(namespace)
    self._push_history(flags=2, payload=(struct.pack("H", unit_index) + data))

  def update_runners(self, *namespaces):
    payload = bytearray()

    for namespace in self._unit_list:
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
      "master": self.master and self.master.export(),
      "issues": [issue.export() for issue in self.issues],
      "readable": True,
      "runners": {
        namespace: runner.export() for namespace, runner in self.runners.items()
      },
      "unitList": list(self.runners.keys())
    }

  def duplicate(self, chips_dir, *, host, template):
    chip = self._allocate_chip(chips_dir, host=host)

    for namespace, runner in chip.runners.items():
      if namespace in self.runners:
        runner.duplicate(self.runners[namespace], template=template)
      else:
        runner.create()

    chip.update_runners()

    return chip

  def upgrade(self, *, host):
    for namespace, unit in host.units.items():
      if hasattr(unit, 'Runner') and not (namespace in self.runners):
        runner = unit.Runner(chip=self, host=host)
        self.runners[namespace] = runner

        runner.create()

    self.issues.clear()
    self.update_runners()


  @classmethod
  def create(cls, chips_dir, *, host):
    chip = cls._allocate_chip(chips_dir, host=host)

    for runner in chip.runners.values():
      runner.create()

    chip.update_runners()
    return chip

  @classmethod
  def unserialize(cls, chip_dir, *, host):
    header_path = chip_dir / ".header.json"
    header = json.load(header_path.open())
    chip_kwargs = dict(
      dir=chip_dir,
      id=header['id']
    )

    if header['version'] != cls.version:
      chip = UnreadableChip(**chip_kwargs)
      chip.issues.append(UnsupportedChipVersionError())

      return chip

    chip = cls(**chip_kwargs)
    issues = list()

    for namespace in header['unit_list']:
      unit = host.units.get(namespace)

      if not (unit and hasattr(unit, 'Runner')):
        issues.append(ExtraneousUnitError(namespace))

    for namespace in host.ordered_namespaces:
      unit = host.units[namespace]

      if not hasattr(unit, 'Runner'):
        continue

      if not (namespace in header['unit_list']):
        issues.append(MissingUnitError(namespace))
        continue

      runner = unit.Runner(chip=chip, host=host)

      try:
        runner.unserialize_raw(base64.b85decode(header['runners'][namespace].encode("utf-8")))
      except UnsupportedChipRunnerError as e:
        e.namespace = namespace
        issues.append(e)
      except DegradedChipRunnerError as e:
        e.namespace = namespace
        issues.append(e)
        chip.runners[namespace] = runner
      except CorruptedChipError as e:
        issues.append(e)
        break
      else:
        chip.runners[namespace] = runner
    else:
      chip.issues += issues
      return chip

    chip = UnreadableChip(**chip_kwargs)
    chip.issues += issues

    return chip


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

  @classmethod
  def try_unserialize(cls, chip_dir, *, host):
    try:
      return cls.unserialize(chip_dir, host=host)
    except Exception:
      logger.warn(f"Chip '{chip_dir.name}' is corrupted and will be ignored. The exception is printed below.")
      log_exception(logger)

      return UnreadableChip(
        corrupted=True,
        dir=chip_dir
      )

  @staticmethod
  def _allocate_chip(chips_dir, *, host):
    chip_id = str(uuid.uuid4())
    chip_dir = chips_dir / chip_id
    chip_dir.mkdir(exist_ok=True)

    chip = Chip(
      id=chip_id,
      dir=chip_dir
    )

    chip.runners = {
      namespace: unit.Runner(chip=chip, host=host) for namespace, unit in host.units.items() if hasattr(unit, 'Runner')
    }

    return chip

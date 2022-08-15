import base64
import json
import math
import pickle
import struct
import time
import uuid

# flags (4)
#  0 - reserved
#  1 - matrix update
#  2 - metadata update (deprecated)
#  3 - process
# time (8)
# payload size (4)
message_header_format = "IQI"


class UnsupportedChip:
  def __init__(self, *, archived, dir, id, metadata):
    self.archived = archived
    self.dir = dir
    self.id = id
    self.metadata = metadata

  @property
  def supported(self):
    return False


class Chip:
  version = 1

  def __init__(self, *, archived, dir, id, metadata, unit_list, unit_versions):
    self.archived = archived
    self.dir = dir
    self.id = id
    self.master = None
    self.matrices = None
    self.metadata = metadata
    self.runners = None
    self.unit_list = unit_list
    self.unit_versions = unit_versions

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
      'matrices': {
        namespace: base64.b85encode(matrix.serialize_raw()).decode("utf-8") for namespace, matrix in self.matrices.items()
      },
      'metadata': self.metadata,
      'unit_list': self.unit_list,
      'unit_versions': self.unit_versions,
      'version': self.version
    }, self._header_path.open("w"))

  @property
  def supported(self):
    return True

  def push_process(self, namespace, data):
    unit_index = self.unit_list.index(namespace)
    self._push_history(flags=3, payload=(struct.pack("H", unit_index) + data))

  def ensure_runners(self, *, host):
    if not self.runners:
      self.runners = dict()

      for namespace in self.unit_list:
        unit = host.units[namespace]

        if hasattr(unit, 'Runner'):
          self.runners[namespace] = unit.Runner(chip=self, host=host)

  def update_matrices(self, update = dict()):
    for namespace, matrix_data in update.items():
      self.matrices[namespace].update(matrix_data)

    payload = bytearray()

    for namespace in self.unit_list:
      matrix = self.matrices.get(namespace)

      matrix_payload = matrix.serialize_raw() if matrix else pickle.dumps(None)
      payload.extend(struct.pack("H", len(matrix_payload)))
      payload.extend(matrix_payload)

    self._push_history(flags=1, payload=payload)
    self._save_header()

    if self.runners:
      for runner in self.runners.values():
        runner.update()

  def update_metadata(self, update = dict()):
    self.metadata = { **self.metadata, **update }
    self._push_history(flags=2, payload=pickle.dumps(self.metadata))
    self._save_header()

  def export(self):
    return {
      "id": self.id,
      "archived": self.archived,
      "master": self.master and self.master.export(),
      "matrices": {
        namespace: matrix.export() for namespace, matrix in self.matrices.items()
      },
      "name": self.metadata['name'],
      "metadata": self.metadata,
      "runners": self.runners and {
        namespace: runner.export() for namespace, runner in self.runners.items()
      }
    }


  def create(chips_dir, name, *, host):
    chip_id = str(uuid.uuid4())
    chip_dir = chips_dir / chip_id
    chip_dir.mkdir(exist_ok=True)

    metadata = {
      'created_time': time.time(),
      'name': name
    }

    unit_versions = { namespace: unit.version for namespace, unit in host.units.items() }

    chip = Chip(
      archived=False,
      id=chip_id,
      dir=chip_dir,
      metadata=metadata,
      unit_list=list(unit_versions.keys()),
      unit_versions=unit_versions
    )

    chip.matrices = { namespace: unit.Matrix(chip=chip, host=host) for namespace, unit in host.units.items() if hasattr(unit, 'Matrix') }

    for matrix in chip.matrices.values():
      matrix.create()

    chip._save_header()
    chip.update_matrices()
    chip.update_metadata()

    return chip

  def unserialize(chip_dir, *, host):
    header_path = chip_dir / ".header.json"
    header = json.load(header_path.open())

    if (header['version'] != Chip.version) or any((not namespace in host.units) or (host.units[namespace].version != unit_version) for namespace, unit_version in header['unit_versions'].items()):
      return UnsupportedChip(
        archived=header['archived'],
        dir=chip_dir,
        id=header['id'],
        metadata=header['metadata']
      )

    # for namespace, version in header['unit_versions'].items():
    #   if not (namespace in host.units) or (host.units[namespace].version != version):
    #     return UnsupportedChip(
    #       archived=header['archived'],
    #       dir=chip_dir,
    #       id=header['id'],
    #       metadata=header['metadata']
    #     )

    # history_path = chip_dir / ".history.dat"
    # history_file = history_path.open("rb")

    # matrices = None
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
      metadata=header['metadata'],
      unit_list=header['unit_list'],
      unit_versions=header['unit_versions']
    )

    chip.matrices = {
      name: host.units[name].Matrix(chip=chip, host=host) for name in header['matrices'].keys()
    }

    for name, matrix in chip.matrices.items():
      matrix.unserialize_raw(base64.b85decode(header['matrices'][name].encode("utf-8")))

    return chip

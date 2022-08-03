import base64
import json
import math
import pickle
import struct
import time
import uuid

# flags (4)
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
  def __init__(self, *, archived, dir, id, matrices, metadata, unit_list, unit_versions):
    self.archived = archived
    self.dir = dir
    self.id = id
    self.master = None
    self.matrices = matrices
    self.metadata = metadata
    self.runners = None
    self.unit_list = unit_list
    self.unit_versions = unit_versions

    self._header_path = (dir / ".header.json")

    self._history_path = (dir / ".history.dat")
    self._history_file = None

  def _initialize_matrices(self, *, host):
    for matrix in self.matrices.values():
      matrix.initialize(chip=self, host=host)

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
        name: base64.b85encode(matrix.serialize()).decode("utf-8") for name, matrix in self.matrices.items()
      },
      'metadata': self.metadata,
      'unit_list': self.unit_list,
      'unit_versions': self.unit_versions
    }, self._header_path.open("w"))

  @property
  def supported(self):
    return True

  def ensure_runners(self, *, host):
    if not self.runners:
      self.runners = dict()

      for name in self.unit_list:
        unit = host.units[name]

        if hasattr(unit, 'Runner'):
          self.runners[name] = unit.Runner(chip=self, host=host)

  def update_matrices(self, update = dict()):
    for name, matrix_data in update.items():
      self.matrices[name].update(matrix_data)

    payload = bytearray()

    for name in self.unit_list:
      matrix = self.matrices.get(name)

      matrix_payload = matrix.serialize() if matrix else pickle.dumps(None)
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
    matrices = { namespace: unit.Matrix() for namespace, unit in host.units.items() if hasattr(unit, 'Matrix') }

    chip = Chip(
      archived=False,
      id=chip_id,
      dir=chip_dir,
      matrices=matrices,
      metadata=metadata,
      unit_list=list(unit_versions.keys()),
      unit_versions=unit_versions
    )

    chip._initialize_matrices(host=host)
    chip._save_header()
    chip.update_matrices()
    chip.update_metadata()

    return chip

  def unserialize(chip_dir, *, host):
    header_path = chip_dir / ".header.json"
    header = json.load(header_path.open())

    for name, version in header['unit_versions'].items():
      if not (name in host.units) or (host.units[name].version != version):
        return UnsupportedChip(
          archived=header['archived'],
          dir=chip_dir,
          id=header['id'],
          metadata=header['metadata']
        )

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

    matrices = {
      name: host.units[name].Matrix.unserialize(base64.b85decode(raw_matrix.encode("utf-8"))) for name, raw_matrix in header['matrices'].items()
    }

    chip = Chip(
      archived=header['archived'],
      dir=chip_dir,
      id=header['id'],
      matrices=matrices,
      metadata=header['metadata'],
      unit_list=header['unit_list'],
      unit_versions=header['unit_versions']
    )

    chip._initialize_matrices(host=host)
    return chip

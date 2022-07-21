import json
import time
import uuid

from .units.microfluidics.model import Model


class Chip:
  def __init__(self, *, dir, id, matrices, metadata, spec):
    self.dir = dir
    self.id = id
    self.master = None
    self.matrices = matrices
    self.metadata = metadata
    self.runners = None
    self.spec = spec

  # Update runners following a matrix update
  def update_runners(self):
    # for runner in self.runners.values():
    #   runner.update()

    pass

  def export(self):
    return {
      "id": self.id,
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

    spec={ namespace: unit.version for namespace, unit in host.units.items() if hasattr(unit, 'version') }
    matrices = { namespace: unit.Matrix() for namespace, unit in host.units.items() if hasattr(unit, 'Matrix') }

    chip = Chip(
      id=chip_id,
      dir=chip_dir,
      matrices=matrices,
      metadata=metadata,
      spec=spec
    )

    for matrix in chip.matrices.values():
      matrix.commit(chip=chip, host=host)

    header = {
      'id': chip.id,
      'matrices': {
        namespace: matrix.serialize() for namespace, matrix in chip.matrices.items()
      },
      'metadata': chip.metadata,
      'spec': chip.spec
    }

    header_path = chip_dir / "header.json"
    header_path.open("w").write(json.dumps(header) + "\n")

    return chip

  def unserialize(chip_dir, *, units):
    header_path = chip_dir / "header.json"
    header = json.load(header_path.open())

    matrices = {
      namespace: unit.Matrix.unserialize(header['matrices'][namespace]) for namespace, unit in units.items() if hasattr(unit, 'Matrix')
    }

    return Chip(
      dir=chip_dir,
      id=header['id'],
      matrices=matrices,
      metadata=header['metadata'],
      spec=header['spec']
    )

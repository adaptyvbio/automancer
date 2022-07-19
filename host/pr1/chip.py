import json
import uuid

from .model import Model


class Chip:
  def __init__(self, *, id, matrices, metadata, model, path):
    self.id = id
    self.master = None
    self.matrices = matrices
    self.metadata = metadata
    self.model = model
    self.path = path
    self.runners = None

  # Update runners following a matrix update
  def update_runners(self):
    for runner in self.runners.values():
      runner.update()

  def create(chips_dir, model, name):
    chip_id = str(uuid.uuid4())
    path = chips_dir / (chip_id + ".dat")
    metadata = { 'name': name }

    matrices = {
      namespace: unit.Matrix.load(model.sheets[namespace]) for namespace, unit in model.units.items() if hasattr(unit, 'Matrix')
    }

    header = {
      'id': chip_id,
      'matrices': {
        namespace: matrix.serialize() for namespace, matrix in matrices.items()
      },
      'metadata': metadata,
      'model': model.serialize(),
      'model_hash': hash(model),
      'model_id': model.id
    }

    path.open("w").write(json.dumps(header) + "\n")

    return Chip(
      id=chip_id,
      matrices=matrices,
      metadata=metadata,
      model=model,
      path=path
    )

  def unserialize(path, *, models, units):
    header_line = next(path.open())
    header = json.loads(header_line)

    existing_model = models[header['model_id']]

    if existing_model and (header['model_hash'] == hash(existing_model)):
      model = existing_model
    else:
      model = Model.unserialize(header['model'], units=units)
      model.id = str(uuid.uuid4())
      models[model.id] = model

    matrices = {
      namespace: unit.Matrix.unserialize(header['matrices'][namespace], sheet=model.sheets[namespace]) for namespace, unit in model.units.items()
    }

    return Chip(
      id=header['id'],
      matrices=matrices,
      metadata=header['metadata'],
      model=model,
      path=path
    )

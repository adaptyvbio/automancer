from .reader import parse
from .util.parser import Identifier
from .util import schema as sc


class Model:
  def __init__(self, *, id, name, sheets):
    self.id = id
    self.name = name
    self.sheets = sheets

  def load(path, units):
    data = parse(path.open().read())

    schema = sc.Dict({
      'id': sc.Optional(Identifier()),
      'name': str
    }, allow_extra=True)

    schema.validate(data)

    model_id = data.get('id') or str(abs(hash(path)))

    return Model(
      id=model_id,
      name=data.get('name', f"Model {model_id}"),
      sheets={
        namespace: unit.Sheet(data, dir=path.parent) for namespace, unit in units.items() if unit.Sheet
      }
    )

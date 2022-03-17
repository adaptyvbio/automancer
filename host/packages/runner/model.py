from .reader import parse
from .util.parser import check_identifier
from .util.schema import And, Optional, Schema, Use


class Model:
  def __init__(self, *, id, name, sheets):
    self.id = id
    self.name = name
    self.sheets = sheets

  def load(path, units):
    data = parse(path.open().read())

    schema = Schema({
      "id": Optional(And(str, Use(check_identifier))),
      "name": str
    })

    schema.validate(data)

    model_id = data.get("id") or str(abs(hash(path)))

    return Model(
      id=model_id,
      name=data.get("name", f"Model {model_id}"),
      sheets={
        namespace: unit.Sheet(data, dir=path.parent) for namespace, unit in units.items()
      }
    )

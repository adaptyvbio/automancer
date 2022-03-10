from .reader import parse
from .util.parser import check_identifier
from .util.schema import And, Optional, Schema, Use


class ChipModel:
  def __init__(self, *, id, name, sheets):
    self.id = id
    self.name = name
    self.sheets = sheets

  def load(path, models):
    data = parse(path.open().read())

    schema = Schema({
      "id": Optional(And(str, Use(check_identifier))),
      "name": str
    })

    schema.validate(data)

    return ChipModel(
      id=(data.get("id") or str(abs(hash(path)))),
      name=data["name"],
      sheets={
        namespace: model.Sheet(data, dir=path.parent) for namespace, model in models.items()
      }
    )

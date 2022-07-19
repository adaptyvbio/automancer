import mimetypes

from .reader import LocatedValue, parse
from .util.blob import Blob
from .util.parser import Identifier
from .util import schema as sc


class Model:
  def __init__(self, *, id, name, preview, sheets, spec, units):
    self.id = id
    self.name = name
    self.preview = preview
    self.sheets = sheets
    self.spec = spec
    self.units = units

  def export(self):
    return {
      "id": self.id,
      "name": self.name,
      "previewUrl": self.preview and self.preview.to_url(),
      "sheets": {
        namespace: sheet.export() for namespace, sheet in self.sheets.items()
      }
    }

  def serialize(self):
    return {
      'id': self.id,
      'name': self.name,
      'sheets': {
        namespace: sheet.serialize() for namespace, sheet in self.sheets.items()
      },
      'spec': self.spec
    }


  def load(path, units):
    model_dir = path.parent
    data = parse(path.open().read())

    spec_schema = {
      'spec': sc.Optional(sc.SimpleDict(str, str))
    }

    sc.Dict(spec_schema, allow_extra=True).validate(data)

    spec = data.get('spec', dict())
    units_subset = use_spec(spec, units)

    sc.Dict({
      **spec_schema,
      'id': sc.Optional(Identifier()),
      'name': str,
      'preview': sc.Optional(str),
      'spec': sc.Optional(sc.SimpleDict(str, str)),
      **({ key: sc.Optional(sc.Any()) for unit in units_subset.values() if hasattr(unit, 'Sheet') for key in unit.Sheet.keys })
    }).validate(data)

    model_id = data.get('id', str(abs(hash(path))))
    name = data.get('name', f"Model {model_id}")

    if 'preview' in data:
      preview_path = model_dir / data['preview']

      try:
        preview_data = preview_path.open("rb").read()
      except FileNotFoundError:
        raise data['preview'].error(f"Missing file at {preview_path}")

      preview_type, _encoding = mimetypes.guess_type(preview_path)

      if (preview_type is None) or (not preview_type.startswith("image/")):
        raise data['preview'].error(f"Invalid file type{' ' + (preview_type) if preview_type else str()}, expected image/*")

      preview = Blob(data=preview_data, type=preview_type)
    else:
      preview = None

    return Model(
      id=model_id,
      name=name,
      preview=preview,
      sheets={
        namespace: unit.Sheet(data, dir=model_dir) for namespace, unit in units_subset.items() if hasattr(unit, 'Sheet')
      },
      spec=spec,
      units=units_subset
    )

  def unserialize(data, *, units):
    units_subset = use_spec(data['spec'], units)

    return Model(
      id=data['id'],
      name=data['name'],
      preview=None,
      sheets={
        namespace: units_subset[namespace].Sheet.unserialize(data_sheet) for namespace, data_sheet in data['sheets'].items()
      },
      spec=data['spec'],
      units=units_subset
    )


def use_spec(spec, units):
  for namespace, version in spec.items():
    unit = units.get(namespace)
    if (not unit) or (not hasattr(unit, 'Executor')):
      raise LocatedValue.create_error("Unsupported unit", namespace)
    if (not unit.Executor.supports(version)):
      raise LocatedValue.create_error("Unsupported unit version", version)

  return { namespace: units[namespace] for namespace in spec.keys() }

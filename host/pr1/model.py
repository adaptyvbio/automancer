import mimetypes

from .reader import parse
from .util.blob import Blob
from .util.parser import Identifier
from .util import schema as sc



schema = sc.Dict({
  'id': sc.Optional(Identifier()),
  'name': str,
  'preview': sc.Optional(str)
}, allow_extra=True)

class Model:
  def __init__(self, *, id, name, preview, sheets):
    self.id = id
    self.name = name
    self.preview = preview
    self.sheets = sheets

  def export(self):
    return {
      "id": self.id,
      "name": self.name,
      "previewUrl": self.preview and self.preview.to_url(),
      "sheets": {
        namespace: sheet.export() for namespace, sheet in self.sheets.items()
      }
    }

  def load(path, units):
    dir = path.parent
    data = parse(path.open().read())

    schema.validate(data)

    id = data.get('id', str(abs(hash(path))))
    name = data.get('name', f"Model {id}")

    if 'preview' in data:
      preview_path = dir / data['preview']

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
      id=id,
      name=name,
      preview=preview,
      sheets={
        namespace: unit.Sheet(data, dir=dir) for namespace, unit in units.items() if hasattr(unit, 'Sheet')
      }
    )

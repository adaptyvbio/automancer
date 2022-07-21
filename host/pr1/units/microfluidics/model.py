from collections import namedtuple
import mimetypes

from ...reader import LocatedValue, parse
from ...util.blob import Blob
from ...util.parser import Identifier, check_identifier
from ...util import schema as sc


Channel = namedtuple("Channel", ['diagram_ref', 'id', 'inverse', 'label', 'repr'])
ChannelGroup = namedtuple("ChannelGroup", ['channel_indices', 'label'])

def parse_diagram_ref(value):
  fragments = value.split(",")

  if len(fragments) != 2:
    raise value.error("Invalid diagram reference")

  def it(frag):
    try:
      return int(frag)
    except ValueError:
      raise frag.error("Invalid diagram reference entry")

  return value, [it(frag) for frag in fragments]


display_values = ['active', 'delta', 'inactive', 'never']
repr_values = ['barrier', 'flow', 'isolate', 'move', 'push', 'subset']

entity_schema = {
  'display': sc.Optional(sc.Or(*[sc.Exact(value) for value in display_values])),
  'repr': sc.Optional(sc.Or(*[sc.Exact(value) for value in repr_values]))
}


class Model:
  def __init__(self, *, channels, diagram, groups, id, name, preview):
    self.channels = channels
    self.diagram = diagram
    self.groups = groups
    self.id = id
    self.name = name
    self.preview = preview

  def export(self):
    return {
      "id": self.id,
      "name": self.name,
      "diagram": self.diagram,
      "previewUrl": self.preview and self.preview.to_url(),
      "channels": [{
        "id": channel.id,
        "diagramRef": channel.diagram_ref,
        "label": channel.label,
        "repr": channel.repr
      } for channel in self.channels],
      "groups": [{
        "channelIndices": group.channel_indices,
        "label": group.label
      } for group in self.groups]
    }


  def load(path):
    model_dir = path.parent
    data = parse(path.open().read())

    schema = sc.Dict({
      'id': sc.Optional(Identifier()),
      'name': str,
      'preview': sc.Optional(str),
      'diagram': sc.Optional(str),
      'groups': sc.Optional(sc.List({
        'label': sc.Optional(str),
        'inverse': sc.Optional(sc.ParseType(bool)),
        'channels': sc.List({
          **entity_schema,
          'alias': sc.Optional(Identifier()),
          'diagram': sc.Optional(sc.Transform(parse_diagram_ref, str)),
          'id': Identifier(),
          'inverse': sc.Optional(sc.ParseType(bool)),
          'label': sc.Optional(str)
        })
      }))
    })

    data = schema.transform(data)

    model_id = data.get('id', str(abs(hash(path))))


    # -- Parse preview ------------------------------------

    if 'preview' in data:
      preview_path = model_dir / data['preview']

      try:
        preview_data = preview_path.open("rb").read()
      except FileNotFoundError:
        raise data['preview'].error(f"Missing file at {preview_path}")

      preview_type, _encoding = mimetypes.guess_type(preview_path)

      if (preview_type is None) or (not preview_type.startswith("image/")):
        raise data['preview'].error(f"Invalid file type{(' ' + preview_type) if preview_type else str()}, expected image/*")

      preview = Blob(data=preview_data, type=preview_type)
    else:
      preview = None


    # -- Parse groups & channels --------------------------

    channels = list()
    channel_names = dict()
    groups = list()

    for data_group in data.get('groups', list()):
      group_channel_indices = list()
      group_inverse = data_group.get('inverse', False)

      for data_channel in data_group['channels']:
        channel_id = data_channel['id']

        if channel_id in channel_names:
          raise channel_id.error(f"Duplicate channel with id '{channel_id}'")

        channel_index = len(channels)
        channel_names[channel_id] = channel_index
        group_channel_indices.append(channel_index)

        diagram_ref = None

        if 'diagram' in data_channel:
          diagram_ref_str, diagram_ref = data_channel.get('diagram')

          if diagram_ref and not ('diagram' in data):
            raise diagram_ref_str.error("Invalid reference to missing diagram")

        channels.append(Channel(
          id=channel_id,
          label=data_channel.get('label', channel_id),
          # alias=data_channel['alias'],
          diagram_ref=diagram_ref,
          inverse=(data_channel.get('inverse', False) != group_inverse),
          repr=data_channel.get('repr', 'flow')
        ))

      groups.append(ChannelGroup(
        label=data_group.get('label'),
        channel_indices=group_channel_indices
      ))


    # -- Parse diagram ------------------------------------

    diagram = None

    if 'diagram' in data:
      diagram_path = model_dir / data['diagram']

      try:
        diagram = diagram_path.open().read()
      except FileNotFoundError:
        raise data['diagram'].error(f"Missing file at {diagram_path}")


    return Model(
      channels=channels,
      diagram=diagram,
      groups=groups,
      id=model_id,
      name=data['name'],
      preview=preview
    )

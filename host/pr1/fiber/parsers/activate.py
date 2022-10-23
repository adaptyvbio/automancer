from .. import langservice as lang
from ..parser import BaseParser, BlockData, BlockUnitState, SegmentTransform
# from ...units.base import BaseParser
from ...util.decorators import debug


@debug
class AcmeState(BlockUnitState):
  process = True

  def __init__(self, value):
    self._value = value

class AcmeParser(BaseParser):
  namespace = "activate"

  root_attributes = {
    'microscope': lang.Attribute(
      description=["`acme.microscope`", "Microscope settings"],
      optional=True,
      type=lang.SimpleDict({
        'exposure': lang.Attribute(
          description=["`exposure`", "Camera exposure"],
          detail="Exposure time in seconds",
          type=lang.AnyType()
        ),
        'zzz': lang.Attribute(type=lang.AnyType())
      }, foldable=True)
    ),
    'value': lang.Attribute(
      label="Value",
      detail="Value of the object",
      description=["`acme.value`", "The value for the acme device."],
      optional=True,
      type=lang.PrimitiveType(float)
    ),
    'wait': lang.Attribute(
      label="Wait for a fixed delay",
      detail="Wait for a delay",
      optional=True,
      type=lang.AnyType()
    )
  }

  segment_attributes = {
    'activate': lang.Attribute(
      description=["#### ACTIVATE", 'Type: int'],
      optional=True,
      type=lang.PrimitiveType(int)
    )
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def enter_protocol(self, data_protocol):
    pass

  def parse_block(self, block_attrs, context):
    attrs = block_attrs[self.namespace]

    if 'activate' in attrs:
      value = attrs['activate'].value

      if value < 0:
        return lang.Analysis(errors=[Exception("Negative value")]), Ellipsis

      return lang.Analysis(), BlockData(state=AcmeState(value), transforms=[SegmentTransform(self.namespace)])
    else:
      return lang.Analysis(), BlockData()

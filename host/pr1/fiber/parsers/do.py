from typing import Any

from .. import langservice as lang
from ..expr import PythonExprEvaluator
from ..parser import BaseParser, BaseTransform, BlockData, BlockUnitState
from ...util import schema as sc
from ...util.decorators import debug


class DoParser(BaseParser):
  namespace = "do"

  root_attributes = dict()
  segment_attributes = {
    'do_before': lang.Attribute(optional=True, type=lang.AnyType()),
    'do_after': lang.Attribute(optional=True, type=lang.AnyType())
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def enter_protocol(self, data_protocol):
    pass

  def parse_block(self, block_attrs, context):
    attrs = block_attrs[self.namespace]
    transforms = list()

    if 'do_before' in attrs:
      transforms.append(DoTransform(attrs['do_before'], before=True, context=context, parser=self))
    if 'do_after' in attrs:
      transforms.append(DoTransform(attrs['do_after'], before=False, context=context, parser=self))

    return lang.Analysis(), BlockData(transforms=transforms)

@debug
class DoTransform(BaseTransform):
  def __init__(self, data_do: Any, /, *, before: bool, context, parser: DoParser):
    self._before = before
    self._context = context
    self._data_do = data_do
    self._parser = parser

  def execute(self, state, parent_state, transforms, envs):
    result = self._parser._fiber.parse_block(self._data_do, context=self._context)

    if result is Ellipsis:
      return lang.Analysis(), Ellipsis

    block_state, block_transforms = result

    if self._before:
      return lang.Analysis(), self._parser._fiber.execute(state, parent_state | block_state, block_transforms + transforms, envs)
    else:
      return lang.Analysis(), self._parser._fiber.execute(block_state, parent_state | state, transforms + block_transforms, envs)

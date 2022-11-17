from types import EllipsisType
from typing import Any, Optional

from .. import langservice as lang
from ..eval import EvalEnvs, EvalStack
from ..expr import PythonExprEvaluator
from ..parser import BaseParser, BaseTransform, BlockAttrs, BlockData, BlockState, BlockUnitData, BlockUnitState, FiberParser, Transforms
from ...reader import LocationArea
from ...util import schema as sc
from ...util.decorators import debug


class DoParser(BaseParser):
  namespace = "do"

  root_attributes = dict()
  segment_attributes = {
    'do_before': lang.Attribute(optional=True, type=lang.AnyType()),
    'do_after': lang.Attribute(optional=True, type=lang.AnyType())
  }

  def __init__(self, fiber: FiberParser):
    self._fiber = fiber

  def parse_block(self, block_attrs: BlockAttrs, /, adoption_envs: EvalEnvs, adoption_stack: EvalStack, runtime_envs: EvalEnvs) -> tuple[lang.Analysis, BlockUnitData | EllipsisType]:
    attrs = block_attrs[self.namespace]
    transforms = list()

    parse = lambda data: self._fiber.parse_block(data, adoption_envs=adoption_envs, adoption_stack=adoption_stack, runtime_envs=runtime_envs)

    if 'do_before' in attrs:
      data = parse(attrs['do_before'])

      if isinstance(data, EllipsisType):
        return lang.Analysis(), Ellipsis

      transforms.append(DoTransform(data, before=True, parser=self))

    if 'do_after' in attrs:
      data = parse(attrs['do_after'])

      if isinstance(data, EllipsisType):
        return lang.Analysis(), Ellipsis

      transforms.append(DoTransform(data, before=False, parser=self))

    return lang.Analysis(), BlockUnitData(transforms=transforms)

@debug
class DoTransform(BaseTransform):
  def __init__(self, data: BlockData, /, *, before: bool, parser: DoParser):
    self._before = before
    self._data = data
    self._parser = parser

  def execute(self, state: BlockState, parent_state: Optional[BlockState], transforms: Transforms, *, origin_area: LocationArea):
    if self._before:
      return lang.Analysis(), self._parser._fiber.execute(state, parent_state | self._data.state, self._data.transforms + transforms, origin_area=origin_area)
    else:
      return lang.Analysis(), self._parser._fiber.execute(self._data.state, parent_state | state, transforms + self._data.transforms, origin_area=origin_area)

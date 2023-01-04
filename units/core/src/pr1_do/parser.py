from types import EllipsisType
from typing import Any, Optional

from pr1.fiber import langservice as lang
from pr1.fiber.eval import EvalEnvs, EvalStack
from pr1.fiber.expr import PythonExprEvaluator
from pr1.fiber.parser import BaseParser, BaseTransform, BlockAttrs, BlockData, BlockState, BlockUnitData, BlockUnitState, FiberParser, Transforms
from pr1.reader import LocationArea
from pr1.util import schema as sc
from pr1.util.decorators import debug


class DoParser(BaseParser):
  namespace = "do"
  priority = 900

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

  def execute(self, state: BlockState, transforms: Transforms, *, origin_area: LocationArea):
    if self._before:
      return lang.Analysis(), self._parser._fiber.execute(self._data.state | state, self._data.transforms + transforms, origin_area=origin_area)
    else:
      return lang.Analysis(), self._parser._fiber.execute(state | self._data.state, transforms + self._data.transforms, origin_area=origin_area)

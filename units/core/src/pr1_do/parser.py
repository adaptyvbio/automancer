from dataclasses import KW_ONLY, dataclass, field
from types import EllipsisType
from typing import Any, TypedDict

from pr1.fiber import langservice as lang
from pr1.fiber.parser import BaseParser, BaseTransform, BlockData, BlockState, BlockUnitData, BlockUnitPreparationData, FiberParser

from . import namespace


class Attributes(TypedDict, total=False):
  outer: Any

class DoParser(BaseParser):
  namespace = namespace
  priority = 1300

  segment_attributes = {
    'outer': lang.Attribute(lang.AnyType())
  }

  def __init__(self, fiber: FiberParser):
    self._fiber = fiber

  def prepare_block(self, attrs: Attributes, /, adoption_envs, runtime_envs):
    if 'outer' in attrs:
      analysis, preps = self._fiber.prepare_block(attrs['outer'], adoption_envs, runtime_envs)

      if isinstance(preps, EllipsisType):
        return analysis, Ellipsis

      return analysis, BlockUnitPreparationData({ 'outer': preps })

    return lang.Analysis(), BlockUnitPreparationData()

  def parse_block(self, attrs, /, adoption_stack, trace):

    if (preps := attrs['outer']):
      analysis, data = self._fiber.parse_block(preps, adoption_stack, trace)

      if isinstance(data, EllipsisType):
        return analysis, Ellipsis

      return analysis, BlockUnitData(transforms=[DoTransform(data, parser=self)])

    return lang.Analysis(), BlockUnitData()

@dataclass
class DoTransform(BaseTransform):
  data: BlockData
  _: KW_ONLY
  parser: DoParser = field(repr=False)

  def execute(self, state, transforms, *, origin_area):
    return self.parser._fiber.execute(
      self.data.state,
      (self.data.transforms + [RestoreStateTransform(state, parser=self.parser)] + transforms),
      origin_area=origin_area
    )


@dataclass
class RestoreStateTransform(BaseTransform):
  state: BlockState
  _: KW_ONLY
  parser: DoParser = field(repr=False)

  def execute(self, state, transforms, *, origin_area):
    return self.parser._fiber.execute(self.state, transforms, origin_area=origin_area)

from types import EllipsisType
from typing import Any, TypedDict

from pr1.fiber import langservice as lang
from pr1.fiber.parser import (BaseDefaultTransformer, BaseParser, FiberParser,
                              Layer, TransformerAdoptionResult,
                              TransformerPreparationResult)

from . import namespace


class Attributes(TypedDict, total=False):
  outer: Any

class Transformer(BaseDefaultTransformer):
  priority = 1000
  attributes = {
    'outer': lang.Attribute(lang.AnyType())
  }

  def __init__(self, fiber: FiberParser):
    self._fiber = fiber

  def prepare(self, data, /, adoption_envs, runtime_envs):
    if 'outer' in data:
      analysis, layer = self._fiber.parse_layer(data['outer'], adoption_envs, runtime_envs, mode='passive')

      if isinstance(layer, EllipsisType):
        return analysis, Ellipsis

      return analysis, TransformerPreparationResult(
        layer,
        adoption_envs=layer.adoption_envs,
        runtime_envs=layer.runtime_envs
      )
    else:
      return lang.Analysis(), None

  def adopt(self, data: Layer, /, adoption_stack):
    analysis, (adopted_transforms, adoption_stack) = data.adopt(adoption_stack)
    return analysis, TransformerAdoptionResult((data, adopted_transforms), adoption_stack=adoption_stack)

  def execute(self, data: tuple[Layer, Any], /, block):
    layer, adopted_transforms = data
    return layer.execute(adopted_transforms, block)


class Parser(BaseParser):
  namespace = namespace

  def __init__(self, fiber: FiberParser):
    self.transformers = [Transformer(fiber)]

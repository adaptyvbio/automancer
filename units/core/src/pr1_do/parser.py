from types import EllipsisType
from typing import Any, TypedDict

import pr1 as am
from pr1.fiber.parser import (BasePassiveTransformer, BaseParser, FiberParser,
                              Layer, TransformerAdoptionResult,
                              PassiveTransformerPreparationResult)

from . import namespace


class Attributes(TypedDict, total=False):
  outer: Any

class Transformer(BasePassiveTransformer):
  priority = 1000
  attributes = {
    'outer': am.AnyType()
  }

  def __init__(self, fiber: FiberParser):
    self._fiber = fiber

  def prepare(self, data, /, envs):
    if 'outer' in data:
      analysis, layer = self._fiber.parse_layer(data['outer'], envs, mode='passive')

      if isinstance(layer, EllipsisType):
        return analysis, Ellipsis

      return analysis, PassiveTransformerPreparationResult(
        layer,
        envs=layer.envs
      )
    else:
      return am.DiagnosticAnalysis(), None

  def adopt(self, data: Layer, /, adoption_stack, trace):
    analysis, (adopted_transforms, adoption_stack) = data.adopt(adoption_stack, trace)
    return analysis, TransformerAdoptionResult((data, adopted_transforms), adoption_stack=adoption_stack)

  def execute(self, data: tuple[Layer, Any], /, block):
    layer, adopted_transforms = data
    return layer.execute(adopted_transforms, block)


class Parser(BaseParser):
  namespace = namespace

  def __init__(self, fiber: FiberParser):
    super().__init__(fiber)
    self.transformers = [Transformer(fiber)]

from typing import Any
from .. import langservice as lang
from ..expr import PythonExprEvaluator
from ..parser import BaseTransform, BlockData, BlockUnitState, FiberParser
from ...units.base import BaseParser
from ...util import schema as sc
from ...util.decorators import debug


class SequenceParser(BaseParser):
  namespace = "sequence"
  root_attributes = dict()
  segment_attributes = {
    'actions': lang.Attribute(optional=True, type=lang.AnyType())
  }

  def __init__(self, fiber: FiberParser):
    self._fiber = fiber

  def enter_protocol(self, data_protocol):
    pass

  def parse_block(self, block_attrs, context):
    attrs = block_attrs[self.namespace]

    if 'actions' in attrs:
      return lang.Analysis(), BlockData(transforms=[
        SequenceTransform(attrs['actions'], parser=self)
      ])
    else:
      return lang.Analysis(), BlockData()


@debug
class SequenceTransform(BaseTransform):
  def __init__(self, data_actions: Any, parser: SequenceParser):
    self._data_actions = data_actions
    self._parser = parser

  def execute(self, state, parent_state, transforms):
    children = list()

    for data_action in self._data_actions:
      result = self._parser._fiber.parse_block(data_action)

      if result is not Ellipsis:
        block_state, block_transforms = result
        block = self._parser._fiber.execute(block_state, parent_state | state, transforms + block_transforms)

        if block is None:
          raise Exception("Not ok")

        children.append(block)

    return lang.Analysis(), SequenceBlock(children) if children else Ellipsis

@debug
class SequenceBlock:
  def __init__(self, children):
    self._children = children

  def __getitem__(self, key):
    return self._children[key]

  def evaluate(self, context):
    for child in self._children:
      child.evaluate(context)

  def get_states(self):
    return {state for child in self._children for state in child.get_states()}

  def linearize(self):
    return [([index, *path], subblock) for index, block in enumerate(self._children) for path, subblock in block.linearize()]

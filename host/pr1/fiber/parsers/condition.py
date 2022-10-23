from .. import langservice as lang
from ..expr import PythonExprEvaluator
from ..parser import BlockData, BlockUnitState
from ...units.base import BaseParser
from ...util import schema as sc
from ...util.decorators import debug



class ConditionParser(BaseParser):
  namespace = "condition"

  root_attributes = dict()
  segment_attributes = {
    'if': lang.Attribute(optional=True, type=lang.AnyType())
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def enter_protocol(self, data_protocol):
    pass

  def parse_block_state(self, data_block, parent_state):
    return None

  def parse_block(self, data_block, block_state):
    if 'if' in data_block[self.namespace]:
      data_others = { key: value for key, value in data_block.items() if key != 'if' }
      # data_others = data_block.exclude('if')

      child_block = self._fiber.parse_block(data_others)
      return ConditionBlock(child_block, condition=data_block[self.namespace]['if'])

    return None


@debug
class ConditionBlock(BaseParser):
  def __init__(self, child_block, condition):
    self._child_block = child_block
    self._condition = condition

  def activate(self):
    self._child_block.activate()
    self.first_segment.pre_nodes.append(ConditionNode(
      condition=self._condition,
      target=self.last_segment.post_head
    ))

  @property
  def first_segment(self):
    return self._child_block.first_segment

  @property
  def last_segment(self):
    return self._child_block.last_segment


@debug
class ConditionNode:
  def __init__(self, condition, target):
    self._condition = condition
    self._target = target

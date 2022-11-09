from typing import Any
from .. import langservice as lang
from ..expr import PythonExprEvaluator
from ..parser import BaseParser, BaseTransform, BlockData, BlockUnitState, FiberParser, OpaqueBlock
from ...util import schema as sc
from ...util.decorators import debug


class SequenceParser(BaseParser):
  namespace = "sequence"
  root_attributes = dict()
  segment_attributes = {
    'actions': lang.Attribute(
      description="Describes a nested list of steps.",
      documentation=["Actions can be specified as a standard list:\n```prl\nactions:\n```\nThe output structure will appear as flattened."],
      kind='class',
      optional=True,
      signature="actions:\n  - <action 1>\n  - <action 2>",
      type=lang.PrimitiveType(list)
    )
  }

  def __init__(self, fiber: FiberParser):
    self._fiber = fiber

  def parse_block(self, block_attrs, /, context, envs):
    attrs = block_attrs[self.namespace]

    if 'actions' in attrs:
      block_attrs = [self._fiber.parse_block(data_action, allow_expr=True, envs=envs) for data_action in attrs['actions']]
      block_attrs = [action_attrs for action_attrs in block_attrs if action_attrs is not Ellipsis]

      return lang.Analysis(), BlockData(transforms=[
        SequenceTransform(block_attrs, parser=self)
      ])
    else:
      return lang.Analysis(), BlockData()


@debug
class SequenceTransform(BaseTransform):
  def __init__(self, block_attrs: list[OpaqueBlock], parser: SequenceParser):
    self._block_attrs = block_attrs
    self._parser = parser

  def execute(self, state, parent_state, transforms, envs, *, origin_area, stack):
    analysis = lang.Analysis()
    children = list()
    state.set_envs(envs)

    for action_attrs in self._block_attrs:
      action_analysis, action_result = action_attrs.evaluate(stack)
      analysis += action_analysis

      if action_result is not Ellipsis:
        block_state, block_transforms = action_result
        block = self._parser._fiber.execute(block_state, parent_state | state, transforms + block_transforms, envs, origin_area=None, stack=stack)

        if block is Ellipsis:
          return analysis, Ellipsis

        children.append(block)

    return analysis, SequenceBlock(children) if children else Ellipsis

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

  def linearize(self, context):
    analysis = lang.Analysis()
    output = list()

    for block in self._children:
      item_analysis, item = block.linearize(context)
      analysis += item_analysis

      if item is Ellipsis:
        continue

      output += item

    return analysis, output

  def export(self):
    return {
      "type": "sequence",
      "children": [child.export() for child in self._children]
    }

from types import EllipsisType
from typing import Any, Optional

from ...reader import LocationArea

from ..eval import EvalEnvs, EvalStack
from .. import langservice as lang
from ..parser import BaseBlock, BaseParser, BaseTransform, BlockAttrs, BlockData, BlockState, BlockUnitData, BlockUnitState, FiberParser, Transforms
from ...util import schema as sc
from ...util.decorators import debug


ActionInfo = tuple[BlockData, LocationArea]

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

  def parse_block(self, block_attrs: BlockAttrs, /, adoption_envs: EvalEnvs, adoption_stack: EvalStack, runtime_envs: EvalEnvs) -> tuple[lang.Analysis, BlockUnitData | EllipsisType]:
  # def parse_block(self, block_attrs: Any, /, adoption_envs, adoption_stack, runtime_envs):
    attrs = block_attrs[self.namespace]

    if 'actions' in attrs:
      if isinstance(attrs['actions'], EllipsisType):
        return lang.Analysis(), Ellipsis

      actions_info: list[ActionInfo] = list()

      for action_attrs in attrs['actions']:
        action_data = self._fiber.parse_block(action_attrs, adoption_envs=adoption_envs, adoption_stack=adoption_stack, runtime_envs=runtime_envs, allow_expr=True)

        if not isinstance(action_data, EllipsisType):
          actions_info.append((action_data, action_attrs.area))

      return lang.Analysis(), BlockUnitData(transforms=[
        SequenceTransform(actions_info, parser=self)
      ])
    else:
      return lang.Analysis(), BlockUnitData()


@debug
class SequenceTransform(BaseTransform):
  def __init__(self, actions_info: list[ActionInfo], /, parser: SequenceParser):
    self._actions_info = actions_info
    self._parser = parser

  def execute(self, state: BlockState, parent_state: Optional[BlockState], transforms: Transforms, *, origin_area: LocationArea):
    analysis = lang.Analysis()
    children: list[BaseBlock] = list()

    for action_data, action_area in self._actions_info:
      action_block = self._parser._fiber.execute(action_data.state, parent_state | state, transforms + action_data.transforms, origin_area=action_area)

      if not isinstance(action_block, EllipsisType):
        children.append(action_block)

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
      "namespace": "sequence",
      "children": [child.export() for child in self._children]
    }

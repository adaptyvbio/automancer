from types import EllipsisType

from ...devices.claim import ClaimSymbol
from ...reader import LocationArea
from ...util import schema as sc
from ...util.decorators import debug
from ...util.iterators import CoupledStateIterator2
from ..langservice import Analysis
from ..eval import EvalEnvs, EvalStack
from ..parser import (BaseBlock, BaseParser, BaseTransform, BlockAttrs,
                      BlockData, BlockProgram, BlockState, BlockUnitData,
                      BlockUnitState, FiberParser, Transforms)
from ..process import ProgramExecEvent


class StateParser(BaseParser):
  namespace = "state"
  # root_attributes = dict()
  # segment_attributes = dict()

  def __init__(self, fiber: FiberParser):
    self._fiber = fiber

  def parse_block(self, block_attrs: BlockAttrs, /, adoption_envs: EvalEnvs, adoption_stack: EvalStack, runtime_envs: EvalEnvs) -> tuple[Analysis, BlockUnitData | EllipsisType]:
    return Analysis(), BlockUnitData(transforms=[StateTransform(parser=self)])

@debug
class StateTransform(BaseTransform):
  def __init__(self, parser: StateParser):
    self._parser = parser

  def execute(self, state: BlockState, transforms: Transforms, *, origin_area: LocationArea):
    child = self._parser._fiber.execute(state, transforms, origin_area=origin_area)

    if isinstance(child, EllipsisType):
      return Analysis(), Ellipsis

    # if isinstance(child, StateBlock):
    #   return Analysis(), StateBlock(
    #     child=child.child,
    #     state=(state | child.state)
    #   )

    return Analysis(), StateBlock(
      child=child,
      state=state
    )


@debug
class StateBlock(BaseBlock):
  def __init__(self, child: BaseBlock, state: BlockState):
    self.child = child
    self.state: BlockState = state # TODO: Remove explicit type hint

  def export(self):
    return {
      "namespace": "state",

      "child": self.child.export(),
      "state": self.state.export()
    }

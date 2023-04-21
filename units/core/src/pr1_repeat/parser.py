from dataclasses import dataclass
from types import EllipsisType
from typing import Any, Optional, TypedDict

from pr1.fiber.eval import EvalContext, EvalEnv, EvalEnvValue, EvalEnvs, EvalStack
from pr1.fiber.expr import Evaluable
from pr1.fiber.langservice import Analysis, Attribute, PotentialExprType, PrimitiveType
from pr1.fiber.master2 import ProgramOwner
from pr1.fiber.parser import (BaseBlock, BaseParser, BaseDefaultTransform,
                              BlockProgram, BlockUnitData,
                              BlockUnitPreparationData, Transforms)
from pr1.fiber.process import ProgramExecEvent
from pr1.master.analysis import MasterAnalysis
from pr1.reader import LocatedValue
from pr1.util.decorators import debug

from . import namespace


class Attributes(TypedDict, total=False):
  repeat: Evaluable[LocatedValue[int]]

class Parser(BaseParser):
  namespace = namespace
  priority = 1200

  segment_attributes = {
    'repeat': Attribute(
      description="Repeats a block a fixed number of times.",
      type=PotentialExprType(PrimitiveType(int))
    )
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def prepare(self, attrs: Attributes, /):
    if (attr := attrs.get('repeat')):
      return Analysis(), [Transform(count=attr)]

    return Analysis(), Transforms()

  """
  def prepare_block(self, attrs: Attributes, /, adoption_envs, runtime_envs):
    if (attr := attrs.get('repeat')):
      env = EvalEnv({
        'index': EvalEnvValue()
      }, name="Repeat", readonly=True)
      return Analysis(), BlockUnitPreparationData((attr, env), envs=[env])

    return Analysis(), BlockUnitPreparationData(None)

  def parse_block(self, attrs: tuple[Evaluable[LocatedValue[int]], EvalEnv], /, adoption_stack, trace):
    count, env = attrs
    analysis, value = count.eval(EvalContext(adoption_stack), final=False)

    if isinstance(value, EllipsisType):
      return analysis, Ellipsis

    return analysis, BlockUnitData(
      transforms=[RepeatTransform(count=value, env=env, parser=self)]
    ) """

@dataclass(kw_only=True)
class Transform(BaseDefaultTransform):
  priority = 100

  count: Evaluable[LocatedValue[int]]

  def __post_init__(self):
    self.env = EvalEnv({
      'index': EvalEnvValue()
    }, name="Repeat", readonly=True)

    self.runtime_envs = [self.env]

  def adopt(self, adoption_envs, adoption_stack):
    # x = self.count.evaluate(EvalContext(adoption_envs, adoption_stack))

    return Analysis(), (None, {
      self.env: { "index": 0 }
    })

  def execute(self, block, data):
    return Analysis(), RepeatBlock(block, count=self.count, env=self.env)


@dataclass(kw_only=True)
class RepeatProgramLocation:
  count: int
  iteration: int

  def export(self):
    return {
      "count": self.count,
      "iteration": self.iteration
    }

@dataclass(kw_only=True)
class RepeatProgramPoint:
  child: Any
  iteration: int

  @classmethod
  def import_value(cls, data: Any, /, block: 'RepeatBlock', *, master):
    return cls(
      child=(block.block.Point.import_value(data["child"], block.block, master=master) if data["child"] is not None else None),
      iteration=data["iteration"]
    )

@debug
class RepeatProgram(BlockProgram):
  def __init__(self, block: 'RepeatBlock', handle):
    self._block = block
    self._handle = handle

    self._child_program: ProgramOwner
    self._halting: bool
    self._iteration: int
    self._point: Optional[RepeatProgramPoint]

  def halt(self):
    self._child_program.halt()
    self._halting = True

  # def jump(self, point: RepeatProgramPoint):
  #   if point.iteration != self._iteration:
  #     self._point = point
  #     self.halt()
  #   elif point.child:
  #     self._child_program.jump(point.child)

  async def run(self, stack):
    analysis, result = self._block.count.eval(EvalContext(stack), final=True)

    if isinstance(result, EllipsisType):
      return # TODO: Do something

    iteration_count = result.value

    self._handle.send(ProgramExecEvent(
      analysis=MasterAnalysis.cast(analysis)
    ))

    # self._point = initial_point or RepeatProgramPoint(child=None, iteration=0)
    self._point = RepeatProgramPoint(child=None, iteration=0)

    while True:
      self._child_program = self._handle.create_child(self._block.block)

      point = self._point

      self._halting = False
      self._iteration = point.iteration
      self._point = None

      if self._iteration >= iteration_count:
        break

      self._handle.send(ProgramExecEvent(location=RepeatProgramLocation(
        count=iteration_count,
        iteration=self._iteration
      )))

      child_stack: EvalStack = {
        **stack,
        self._block.env: { 'index': self._iteration }
      }

      await self._child_program.run(child_stack)

      if self._point:
        pass
      elif self._halting or ((self._iteration + 1) >= iteration_count):
        break

      self._point = RepeatProgramPoint(child=None, iteration=(self._iteration + 1))
      self._handle.collect_children()

      await self._handle.resume_parent()


@debug
class RepeatBlock(BaseBlock):
  Point: type[RepeatProgramPoint] = RepeatProgramPoint
  Program = RepeatProgram

  def __init__(self, block: BaseBlock, count: Evaluable[LocatedValue[int]], env: EvalEnv):
    self.block = block
    self.count = count
    self.env = env

  def __get_node_children__(self):
    return [self.block]

  def export(self):
    return {
      "namespace": namespace,
      "count": self.count.export(),
      "child": self.block.export()
    }

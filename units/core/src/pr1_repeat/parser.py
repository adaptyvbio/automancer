from dataclasses import dataclass
from types import EllipsisType
from typing import Literal, Optional, TypedDict

from pr1.fiber.eval import EvalContext, EvalEnv, EvalEnvValue, EvalStack
from pr1.fiber.expr import Evaluable
from pr1.fiber.langservice import (Analysis, Attribute, IntType, PotentialExprType)
from pr1.fiber.master2 import ProgramOwner
from pr1.fiber.parser import (BaseBlock, BaseParser, BasePassiveTransformer, BaseProgramPoint,
                              BlockProgram,
                              PassiveTransformerPreparationResult,
                              TransformerAdoptionResult)
from pr1.fiber.process import ProgramExecEvent
from pr1.master.analysis import MasterAnalysis
from pr1.reader import LocatedValue
from pr1.util.decorators import debug

from . import namespace


class Attributes(TypedDict, total=False):
  repeat: Evaluable[LocatedValue[int]]

class Transformer(BasePassiveTransformer):
  priority = 400
  attributes = {
    'repeat': Attribute(
      description="Repeats a block a fixed number of times.",
      type=PotentialExprType(IntType(mode='positive_or_null'))
    )
  }

  def __init__(self):
    self.env = EvalEnv({
      'index': EvalEnvValue()
    }, name="Repeat", readonly=True)

  def prepare(self, data: Attributes, /, adoption_envs, runtime_envs):
    if (attr := data.get('repeat')):
      return Analysis(), PassiveTransformerPreparationResult(attr, runtime_envs=[self.env])
    else:
      return Analysis(), None

  def adopt(self, data: Evaluable[LocatedValue[int | Literal['forever']]], /, adoption_stack, trace):
    analysis, count = data.eval(EvalContext(adoption_stack), final=False)

    if isinstance(count, EllipsisType):
      return analysis, Ellipsis

    return analysis, TransformerAdoptionResult(count)

  def execute(self, data: Evaluable[LocatedValue[int | Literal['forever']]], /, block):
    return Analysis(), RepeatBlock(block, count=data, env=self.env)

class Parser(BaseParser):
  namespace = namespace
  transformers = [Transformer()]


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
  child: Optional[BaseProgramPoint]
  iteration: int

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
  def __init__(self, block: BaseBlock, count: Evaluable[LocatedValue[int | Literal['forever']]], env: EvalEnv):
    self.block = block
    self.count = count
    self.env = env

  def __get_node_children__(self):
    return [self.block]

  def create_program(self, handle):
    return RepeatProgram(self, handle)

  def import_point(self, data, /):
    return RepeatProgramPoint(
      child=self.block.import_point(data["child"]),
      iteration=data["iteration"]
    )

  def export(self):
    return {
      "name": "_",
      "namespace": namespace,
      "count": self.count.export(),
      "child": self.block.export()
    }

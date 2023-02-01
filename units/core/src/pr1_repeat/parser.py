from dataclasses import dataclass
from types import EllipsisType
from typing import Any, Optional

from pr1.fiber.expr import Evaluable
from pr1.fiber.process import ProgramExecEvent
from pr1.devices.claim import ClaimSymbol
from pr1.reader import LocationArea
from pr1.fiber import langservice as lang
from pr1.fiber.eval import EvalEnv, EvalEnvs, EvalStack
from pr1.fiber.parser import BaseBlock, BaseParser, BaseTransform, BlockProgram, BlockState, BlockUnitData, BlockUnitPreparationData, BlockUnitState, FiberParser, Transforms
from pr1.util import schema as sc
from pr1.util.decorators import debug

from . import namespace


class RepeatParser(BaseParser):
  namespace = namespace
  priority = 800

  root_attributes = dict()
  segment_attributes = {
    'repeat': lang.Attribute(
      lang.PotentialExprType(lang.PrimitiveType(int)),
      decisive=True
    )
  }

  def __init__(self, fiber: FiberParser):
    self._fiber = fiber

  def prepare_block(self, attrs, /, adoption_envs, runtime_envs):
    if (attr := attrs.get('repeat')):
      env = EvalEnv(readonly=True)
      return lang.Analysis(), BlockUnitPreparationData((attr, env), envs=[env])

    return lang.Analysis(), BlockUnitPreparationData(None)

  def parse_block(self, attrs, /, adoption_stack, trace):
    count, env = attrs
    analysis, value = count.evaluate(adoption_stack)

    if isinstance(value, EllipsisType):
      return analysis, Ellipsis

    return analysis, BlockUnitData(
      transforms=[RepeatTransform(value, env=env, parser=self)]
    )

@debug
class RepeatTransform(BaseTransform):
  def __init__(self, count: Evaluable, *, env: EvalEnv, parser: RepeatParser):
    self._count = count
    self._env = env
    self._parser = parser

  def execute(self, state: BlockState, transforms: Transforms, *, origin_area: LocationArea):
    analysis, block = self._parser._fiber.execute(state, transforms, origin_area=origin_area)

    if isinstance(block, EllipsisType):
      return analysis, Ellipsis

    return analysis, RepeatBlock(block, count=self._count, env=self._env)


@dataclass(kw_only=True)
class RepeatProgramLocation:
  child: Any
  iteration: int

  def export(self):
    return {
      "child": self.child.export(),
      "iteration": self.iteration
    }

@dataclass(kw_only=True)
class RepeatProgramPoint:
  child: Any
  iteration: int

  @classmethod
  def import_value(cls, data: Any, /, block: 'RepeatBlock', *, master):
    return cls(
      child=(block._block.Point.import_value(data["child"], block._block, master=master) if data["child"] is not None else None),
      iteration=data["iteration"]
    )

@debug
class RepeatProgram(BlockProgram):
  def __init__(self, block: 'RepeatBlock', master, parent):
    self._block = block
    self._master = master
    self._parent = parent

    self._child_program: BlockProgram
    self._halting: bool
    self._iteration: int
    self._point = Optional[RepeatProgramPoint]

  @property
  def busy(self):
    return self._child_program.busy

  def get_child(self, block_key: int, exec_key: None):
    return self._child_program

  def import_message(self, message: Any):
    match message["type"]:
      case "halt":
        self.halt()

  def halt(self):
    assert not self.busy

    self._child_program.halt()
    self._halting = True

  def jump(self, point: RepeatProgramPoint):
    if point.iteration != self._iteration:
      self._point = point
      self.halt()
    elif point.child:
      self._child_program.jump(point.child)

  def pause(self):
    assert not self.busy
    self._child_program.pause()

  async def run(self, initial_point: Optional[RepeatProgramPoint], parent_state_program, stack: EvalStack, symbol: ClaimSymbol):
    self._point = initial_point or RepeatProgramPoint(child=None, iteration=0)
    child_block = self._block._block

    while True:
      self._child_program = child_block.Program(child_block, self._master, self)

      point = self._point

      self._halting = False
      self._iteration = point.iteration
      self._point = None

      if self._iteration >= self._block._count:
        break

      child_stack = {
        **stack,
        self._block._env: { 'index': self._iteration }
      }

      async for event in self._child_program.run(point.child, parent_state_program, child_stack, symbol):
        yield ProgramExecEvent(
          location=RepeatProgramLocation(
            child=event.location,
            iteration=self._iteration
          ),
          stopped=event.stopped,
          terminated=(event.terminated and (
            ((self._point.iteration if self._point else (self._iteration + 1)) >= self._block._count) or self._halting
          ))
        )

      if self._point:
        pass
      elif self._halting:
        break
      else:
        self._point = RepeatProgramPoint(child=None, iteration=(self._iteration + 1))


@debug
class RepeatBlock:
  Point = RepeatProgramPoint
  Program = RepeatProgram

  def __init__(self, block: BaseBlock, count: Evaluable, env: EvalEnv):
    self._block = block
    self._count = count
    self._env = env

  def export(self):
    return {
      "namespace": namespace,
      "count": self._count.export(),
      "child": self._block.export()
    }

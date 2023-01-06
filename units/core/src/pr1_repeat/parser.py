from dataclasses import dataclass
from types import EllipsisType
from typing import Any, Optional

from pr1.fiber.process import ProgramExecEvent
from pr1.devices.claim import ClaimSymbol
from pr1.reader import LocationArea
from pr1.fiber import langservice as lang
from pr1.fiber.eval import EvalEnv, EvalEnvs, EvalStack
from pr1.fiber.expr import PythonExprEvaluator
from pr1.fiber.parser import BaseBlock, BaseParser, BaseTransform, BlockAttrs, BlockData, BlockProgram, BlockState, BlockUnitData, BlockUnitState, FiberParser, Transforms
from pr1.util import schema as sc
from pr1.util.decorators import debug


class RepeatParser(BaseParser):
  namespace = "repeat"
  priority = 800

  root_attributes = dict()
  segment_attributes = {
    'repeat': lang.Attribute(optional=True, type=lang.PrimitiveType(int))
  }

  def __init__(self, fiber: FiberParser):
    self._fiber = fiber

  def parse_block(self, block_attrs: BlockAttrs, /, adoption_envs: EvalEnvs, adoption_stack: EvalStack, runtime_envs: EvalEnvs) -> tuple[lang.Analysis, BlockUnitData | EllipsisType]:
    attrs = block_attrs[self.namespace]

    if 'repeat' in attrs and not isinstance(repeat_attr := attrs['repeat'], EllipsisType):
      env = RepeatEnv()

      return lang.Analysis(), BlockUnitData(
        envs=[env],
        transforms=[RepeatTransform(repeat_attr.value, env=env, parser=self)]
      )
    else:
      return lang.Analysis(), BlockUnitData()

@debug
class RepeatTransform(BaseTransform):
  def __init__(self, count: int, *, env: 'RepeatEnv', parser: RepeatParser):
    self._count = count
    self._env = env
    self._parser = parser

  def execute(self, state: BlockState, transforms: Transforms, *, origin_area: LocationArea):
    block = self._parser._fiber.execute(state, transforms, origin_area=origin_area)

    if isinstance(block, EllipsisType):
      return lang.Analysis(), Ellipsis

    return lang.Analysis(), RepeatBlock(block, count=self._count, env=self._env)


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

  async def run(self, initial_point: Optional[RepeatProgramPoint], parent_state_program, symbol: ClaimSymbol):
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

      async for event in self._child_program.run(point.child, parent_state_program, symbol):
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

  def __init__(self, block: BaseBlock, count: int, env: 'RepeatEnv'):
    self._block = block
    self._count = count
    self._env = env

  def export(self):
    return {
      "namespace": "repeat",
      "count": self._count,
      "child": self._block.export()
    }

@debug
class RepeatEnv(EvalEnv):
  def __init__(self):
    pass

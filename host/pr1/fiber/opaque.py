from types import EllipsisType
from typing import Any, Optional

from .eval import EvalEnvs, EvalStack
from .parser import BlockData, FiberParser
from ..reader import LocatedDict, LocatedList


class ConsumedValueError(Exception):
  pass

class OpaqueValue:
  def __init__(self, data: LocatedDict, /, *, adoption_envs: EvalEnvs, adoption_stack: EvalStack, runtime_envs: EvalEnvs, fiber: FiberParser):
    self._data = data
    self._fiber = fiber

    self._adoption_envs = adoption_envs
    self._adoption_stack = adoption_stack
    self._runtime_envs = runtime_envs

    self._block: Optional[BlockData | EllipsisType] = None
    self._value: Any = None

  def as_block(self):
    if self._value is not None:
      raise ConsumedValueError()

    if not self._block:
      self._block = self._fiber.parse_block(self._data, adoption_envs=self._adoption_envs, adoption_stack=self._adoption_stack, runtime_envs=self._runtime_envs)

    return self._block

  def as_value(self):
    if self._block is not None:
      raise ConsumedValueError()

    if self._value is None:
      self._value = LocatedDict({ key: self.wrap(value, adoption_envs=self._adoption_envs, adoption_stack=self._adoption_stack, runtime_envs=self._runtime_envs, fiber=self._fiber) for key, value in self._data.items() }, area=self._data.area)

    return self._value

  def __getitem__(self, key: str):
    return self.as_value()[key]

  def __len__(self):
    return len(self.as_value())

  @classmethod
  def wrap(cls, value: Any, /, *, adoption_envs: EvalEnvs, adoption_stack: EvalStack, runtime_envs: EvalEnvs, fiber: FiberParser) -> Any:
    match value:
      case LocatedDict():
        return cls(value, adoption_envs=adoption_envs, adoption_stack=adoption_stack, runtime_envs=runtime_envs, fiber=fiber)
      case LocatedList():
        return LocatedList([cls.wrap(item, adoption_envs=adoption_envs, adoption_stack=adoption_stack, runtime_envs=runtime_envs, fiber=fiber) for item in value], area=value.area)
      case _:
        return value

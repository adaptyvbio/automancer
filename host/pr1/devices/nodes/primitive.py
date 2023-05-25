from dataclasses import KW_ONLY, dataclass
import time
from typing import Generic, Optional, TypeVar

from .value import ValueNode


class BooleanNode(ValueNode[bool]):
  def _export_spec(self):
    return {
      "type": "boolean"
    }

  def _export_value(self, value: bool, /):
    return value

  async def _read(self):
    old_value = self.value
    self.value = (time.time(), await self._read_value())

    return (old_value is None) or (self.value[1] != old_value[1])

  async def _read_value(self) -> bool:
    raise NotImplementedError


T = TypeVar('T', int, str)

@dataclass
class EnumNodeCase(Generic[T]):
  id: T
  _: KW_ONLY
  label: Optional[str] = None

class EnumNode(ValueNode[T], Generic[T]):
  def __init__(self, *, cases: list[EnumNodeCase], **kwargs):
    super().__init__(**kwargs)
    self.cases = cases

  def _export_spec(self):
    return {
      "type": "enum",
      "cases": [{
        "id": case.id,
        "label": case.label
      } for case in self.cases]
    }

  def _export_value(self, value: T, /):
    return value


__all__ = [
  'BooleanNode',
  'EnumNode',
  'EnumNodeCase'
]

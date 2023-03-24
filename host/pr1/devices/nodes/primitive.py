from dataclasses import KW_ONLY, dataclass
from typing import Generic, Optional, TypeVar

from .value import ValueNode


# class BooleanNode(ValueNode[bool]):
#   def __init__(self, **kwargs):
#     super().__init__(**kwargs)

#   async def _read(self):
#     old_value = self.value
#     self.value = await self._read_value()

#     return self.value != old_value

#   async def _read_value(self) -> bool:
#     raise NotImplementedError

#   def _target_reached(self):
#     return self.value == self.target_value


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

  async def _read(self):
    old_value = self.value
    self.value = await self._read_value()

    return self.value != old_value

  async def _read_value(self) -> T:
    raise NotImplementedError

  def export(self):
    exported = super().export()

    return {
      **exported,
      "value": {
        **exported["value"],
        "type": "enum",
        "cases": [{
          "id": case.id,
          "label": case.label
        } for case in self.cases]
      }
    }

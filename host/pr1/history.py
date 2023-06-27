from abc import ABC
from dataclasses import dataclass
from comserde import serializable

from .fiber.parser import BaseProgramLocation


class BaseTreeChange(ABC):
  pass

@serializable
@dataclass(kw_only=True)
class TreeAdditionChange(BaseTreeChange):
  block_child_id: int
  location: BaseProgramLocation
  parent_index: int

@serializable
@dataclass(kw_only=True)
class TreeRemovalChange(BaseTreeChange):
  index: int

@serializable
@dataclass(kw_only=True)
class TreeUpdateChange(BaseTreeChange):
  index: int
  location: BaseProgramLocation


TreeChange = TreeAdditionChange | TreeRemovalChange | TreeUpdateChange

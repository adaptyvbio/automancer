from abc import ABC
from dataclasses import dataclass
from comserde import serializable

from .util.misc import Exportable


class BaseTreeChange(ABC):
  pass

@serializable
@dataclass(kw_only=True)
class TreeAdditionChange(BaseTreeChange):
  block_child_id: int
  location: Exportable
  parent_index: int

@serializable
@dataclass(kw_only=True)
class TreeRemovalChange(BaseTreeChange):
  index: int

@serializable
@dataclass(kw_only=True)
class TreeUpdateChange(BaseTreeChange):
  index: int
  location: Exportable


TreeChange = TreeAdditionChange | TreeRemovalChange | TreeUpdateChange

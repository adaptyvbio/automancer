from abc import ABC, abstractmethod
from dataclasses import dataclass
import json

from .util import vlq
from .util.misc import Exportable


class TreeChange(ABC):
  @abstractmethod
  def serialize(self) -> bytes:
    ...

  @staticmethod
  def deserialize(data: bytes):
    match data[0]:
      case b"\x01": return TreeAdditionChange.deserialize(data[1:])
      case b"\x02": return TreeRemovalChange.deserialize(data[1:])
      case b"\x03": return TreeUpdateChange.deserialize(data[1:])

@dataclass(kw_only=True)
class TreeAdditionChange(TreeChange):
  block_child_id: int
  location: Exportable
  parent_index: int

  def serialize(self):
    exported = json.dumps(self.location.export()).encode('utf-8')
    return b"\x01" + vlq.encode(self.parent_index) + vlq.encode(len(exported)) + exported

  @classmethod
  def deserialize(cls, data: bytes):
    pass

@dataclass(kw_only=True)
class TreeRemovalChange(TreeChange):
  index: int

  def serialize(self):
    return b"\x02" + vlq.encode(self.index)

  @classmethod
  def deserialize(cls, data: bytes):
    index_length, index = vlq.decode(data)
    return index_length, cls(index=index)

@dataclass(kw_only=True)
class TreeUpdateChange(TreeChange):
  index: int
  location: Exportable

  def serialize(self):
    exported = json.dumps(self.location.export()).encode('utf-8')
    return b"\x03" + vlq.encode(self.index) + vlq.encode(len(exported)) + exported

  @classmethod
  def deserialize(cls, data: bytes):
    pass

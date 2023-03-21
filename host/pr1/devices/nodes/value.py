
from abc import ABC, abstractmethod
from asyncio import Lock
from typing import Generic, NewType, NoReturn, TypeVar

from .common import BaseNode, NodeUnavailableError


T = TypeVar('T')

class ValueNode(BaseNode, ABC):
  def __init__(self):
    super().__init__()
    self._lock = Lock()

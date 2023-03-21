from abc import ABC, abstractmethod
from asyncio import Event, Future, Handle, Lock, Semaphore, Task
from dataclasses import dataclass
from pint import Quantity, Measurement, Unit, UnitRegistry
from typing import Any, AsyncIterator, Awaitable, Callable, ClassVar, Coroutine, Generic, NewType, Optional, Protocol, Sequence, TypeVar, cast
import asyncio
import numpy as np
import traceback
import warnings

from .claim import Claimable
from ..ureg import ureg
from ..util.asyncio import run_anonymous
from ..util.types import SimpleCallbackFunction



# class EnumNodeOption:
#   def __init__(self, label: str):
#     self.label = label
#     self.value: Any

# class EnumReadableNode(BaseReadableNode[int]):
#   def __init__(self):
#     self.options: list[EnumNodeOption]
#     self.value: Optional[int] = None

#   def export(self):
#     def find_option_index(value):
#       return next((index for index, option in enumerate(self.options) if option.value == value), None)

#     return {
#       **super().export(),
#       "data": {
#         "type": "readableEnum",
#         "options": [{ 'label': option.label } for option in self.options],
#         "value": find_option_index(self.value)
#       }
#     }




# Writable value nodes

# class BaseWritableNode(BaseNode, Claimable):
#   pass

# class BaseWritableNode(BaseNode, Claimable, Generic[T]):
#   def __init__(self):
#     BaseNode.__init__(self)
#     Claimable.__init__(self)

#     self.current_value: Optional[T]
#     self.target_value: Optional[T]

  # To be implemented

  # @abstractmethod
  # async def write(self, value: Optional[T], /):
  #   raise NotImplementedError

  # @abstractmethod
  # async def write_import(self, value: Any, /):
  #   raise NotImplementedError

# class BooleanWritableNode(BaseWritableNode):
#   @abstractmethod
#   async def write(self, value: bool, /):
#     ...

  # async def write_import(self, value: bool):
  #   await self.write(value)

  # def export(self):
  #   return {
  #     **super().export(),
  #     "data": {
  #       "type": "writableBoolean",
  #       "currentValue": self.current_value,
  #       "targetValue": self.target_value
  #     }
  #   }

# class EnumWritableNode(BaseWritableNode[int]):
#   def __init__(self, *, options: list[EnumNodeOption]):
#     super().__init__()

#     self.options = options

#   async def write_import(self, value: int):
#     await self.write(value)

#   def export(self):
#     exported = super().export()

#     return {
#       **exported,
#       "data": {
#         "type": "writableEnum",
#         "options": [{ 'label': option.label } for option in self.options],
#         "currentValue": self.current_value,
#         "targetValue": self.target_value
#       }
#     }


# Polled nodes

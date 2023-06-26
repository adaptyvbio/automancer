import hashlib
import itertools
import logging
import traceback
import typing
from abc import ABC, abstractmethod
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Generator, Iterable, Optional, Protocol, Self, Sequence, TypeVar


T = TypeVar('T')
T_contra = TypeVar('T_contra', contravariant=True)

class SupportsAdd(Protocol[T]):
  def __add__(self, __x: T) -> T:
    ...

T_SupportsAdd = TypeVar('T_SupportsAdd', bound=SupportsAdd)

def cumsum(items: Iterable[T_SupportsAdd]) -> Generator[T_SupportsAdd, None, None]:
  it = iter(items)

  try:
    total = next(it)
  except StopIteration:
    return

  yield total

  for item in it:
    total += item
    yield total


def fast_hash(data: bytes | str, /):
  return hashlib.sha256(data.encode() if isinstance(data, str) else data).hexdigest()

def log_exception(logger: logging.Logger, *, level: int = logging.DEBUG):
  for line in traceback.format_exc().split("\n"):
    if line:
      logger.log(level, line)


class SequenceSplitter(Protocol[T_contra]):
  def __call__(self, item: T_contra, /) -> bool:
    ...

def split_sequence(sequence: Sequence[T], func: SequenceSplitter[T], /):
  sequence_false = list[T]()
  sequence_true = list[T]()

  for item in sequence:
    (sequence_true if func(item) else sequence_false).append(item)

  return sequence_false, sequence_true


@typing.runtime_checkable
class Exportable(Protocol):
  def export(self) -> Any:
    ...

class ExportableABC(ABC):
  @abstractmethod
  def export(self) -> Any:
    ...

class UnreachableError(Exception):
  pass


class IndexCounter:
  def __init__(self, *, start: int = 0):
    self._items = set[int]()
    self._start = start

  def new(self):
    for index in itertools.count(start=self._start):
      if index not in self._items:
        self._items.add(index)
        return index

    raise UnreachableError

  def delete(self, item: int):
    self._items.remove(item)


@dataclass
class HierarchyNode:
  def __get_node_name__(self) -> list[str] | str:
    return self.__class__.__name__

  def __get_node_children__(self) -> Iterable[Self | list[str]]:
    return list()

  def format_hierarchy(self, *, prefix: str = str()):
    children = list(self.__get_node_children__())
    raw_name = self.__get_node_name__()
    name = raw_name if isinstance(raw_name, list) else [raw_name]

    return ("\n" + prefix).join(name) + str().join([
      "\n" + prefix
        + ("└── " if (last := (index == (len(children) - 1))) else "├── ")
        + (child.format_hierarchy(prefix=(prefix + ("    " if last else "│   "))) if isinstance(child, HierarchyNode) else ("\n" + prefix + ("    " if last else "│   ")).join(child))
        for index, child in enumerate(children)
    ])


class BaseDataInstance(ABC):
  __slots__ = ()

  @abstractmethod
  def _asdict(self) -> Mapping[str, Any]:
    ...

def create_datainstance(data: Mapping[str, Any]) -> Any:
  # return type(
  #   "FlexibleDataclass",
  #   (BaseFlexibleDataclass,),
  #   {
  #     "__slots__": tuple(data.keys()),
  #     "_asdict": lambda self: data,
  #     "__getitem__": lambda self, key: getattr(self, key),
  #     # **data
  #   }
  # )

  class DataInstance(BaseDataInstance):
    __slots__ = tuple(data.keys())

    def _asdict(self):
      return data

    def __getitem__(self, key: str, /):
      return getattr(self, key)

    def __repr__(self):
      return f"{self.__class__.__name__}({', '.join(f'{key}={data[key]!r}' for key in self.__slots__)})"

  obj = DataInstance()

  for key, value in data.items():
    setattr(obj, key, value)

  return obj


__all__ = [
  'BaseDataInstance',
  'create_datainstance',
  'cumsum',
  'Exportable',
  'ExportableABC',
  'fast_hash',
  'HierarchyNode',
  'IndexCounter',
  'log_exception',
  'split_sequence',
  'UnreachableError'
]

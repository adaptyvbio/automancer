from asyncio import Future
import asyncio
from dataclasses import dataclass, field
import hashlib
from io import IOBase
import itertools
import logging
import traceback
from typing import Awaitable, Generic, Optional, Protocol, Self, Sequence, TypeVar
import typing


FileObject = IOBase

def fast_hash(input: str):
  return hashlib.sha256(input.encode("utf-8")).hexdigest()

def log_exception(logger, *, level = logging.DEBUG):
  for line in traceback.format_exc().split("\n"):
    if line:
      logger.log(level, line)


T = TypeVar('T')
S = TypeVar('S', contravariant=True)

class SequenceSplitter(Protocol[S]):
  def __call__(self, item: S, /) -> bool:
    ...

def split_sequence(sequence: Sequence[T], func: SequenceSplitter[T], /):
  sequence_false = list[T]()
  sequence_true = list[T]()

  for item in sequence:
    (sequence_true if func(item) else sequence_false).append(item)

  return sequence_false, sequence_true


@typing.runtime_checkable
class Exportable(Protocol):
  def export(self) -> object:
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

  def __get_node_children__(self) -> list[Self]:
    return list()

  def format_hierarchy(self, *, prefix: str = str()):
    children = self.__get_node_children__()
    raw_name = self.__get_node_name__()
    name = raw_name if isinstance(raw_name, list) else [raw_name]

    return ("\n" + prefix).join(name) + str().join([
      "\n" + prefix
        + ("└── " if (last := (index == (len(children) - 1))) else "├── ")
        + child.format_hierarchy(prefix=(prefix + ("    " if last else "│   ")))
        for index, child in enumerate(children)
    ])

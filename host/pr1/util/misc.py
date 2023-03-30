from asyncio import Future
import asyncio
import hashlib
from io import IOBase
import itertools
import logging
import traceback
from typing import Awaitable, Protocol
import typing


FileObject = IOBase

def fast_hash(input):
  return hashlib.sha256(input.encode("utf-8")).hexdigest()

def log_exception(logger, *, level = logging.DEBUG):
  for line in traceback.format_exc().split("\n"):
    if line:
      logger.log(level, line)

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

import os
from abc import ABC, abstractmethod
from contextlib import contextmanager
from dataclasses import dataclass
from io import BytesIO, IOBase, TextIOBase
from os import PathLike
from pathlib import Path, PurePath
from types import EllipsisType
from typing import IO, Literal, Optional

from ..analysis import BaseAnalysis, DiagnosticAnalysis
from ..error import Diagnostic, DiagnosticDocumentReference
from ..fiber.expr import Evaluable, EvaluableConstantValue
from ..reader import LocatedValue, LocatedValueContainer, PossiblyLocatedValue
from . import ChainType, DirectedType, PrimitiveType, Type, UnionType


FileOpenMode = Literal['read', 'write']


# Refs

class DataRef(ABC):
  """
  An abstract reference to a file-like object.
  """

  @abstractmethod
  def close_file(self):
    ...

  @abstractmethod
  def open_file(self, text: bool) -> IOBase:
    ...

  @contextmanager
  def open(self, text: bool):
    file = self.open_file(text)

    try:
      yield file
    finally:
      self.close_file()

  def get_name(self) -> Optional[PurePath]:
    return None

  @abstractmethod
  def get_size(self) -> int:
    ...


class BytesDataRef(DataRef):
  """
  A reference to a `bytes` object.
  """

  def __init__(self, data: bytes, /):
    self._data = data

  def close_file(self):
    pass

  def open_file(self, mode: str):
    return BytesIO(self._data)

  def get_size(self):
    return len(self._data)


class FileDataRef(DataRef):
  """
  A reference to an `io.IOBase` object.
  """

  def __init__(self, file: IOBase, /):
    self._file = file

  def close_file(self):
    pass

  def open_file(self, text):
    if text and not isinstance(self._file, TextIOBase):
      raise IOError("File is not open in text mode")

    if (not text) and isinstance(self._file, TextIOBase):
      raise IOError("File is not open in binary mode")

    return self._file

  def get_size(self):
    return os.fstat(self._file.fileno()).st_size


class PathDataRef(DataRef):
  """
  A reference to a file on the filesystem.
  """

  def __init__(self, path: Path, /, mode: FileOpenMode):
    self._file: Optional[IO] = None
    self._mode = mode
    self._path = path

  def path(self):
    return self._path

  def close_file(self):
    assert self._file
    self._file.close()

  def open_file(self, text):
    if self._mode == 'write':
      self._path.parent.mkdir(exist_ok=True, parents=True)

    file = self._path.open({ 'read': 'r', 'write': 'w' }[self._mode] + (str() if text else 'b'))

    # assert isinstance(file, IOBase)
    self._file = file

    return file

  def get_name(self):
    return PurePath(self._path.name)

  def get_size(self):
    if not self._file:
      raise RuntimeError("File not open")

    return os.fstat(self._file.fileno()).st_size

  def __repr__(self):
    return f"{self.__class__.__name__}({str(self._path)!r})"


# Errors

class InvalidFileObject(Diagnostic):
  def __init__(self, target: LocatedValue, /):
    super().__init__(
      "Invalid file object",
      references=[DiagnosticDocumentReference.from_value(target)]
    )

class PathOutsideDirError(Diagnostic):
  def __init__(self, target: LocatedValue[Path], dir_path: Path, /):
    delta = os.path.relpath(target.value, dir_path)
    super().__init__(f"Path '{str(delta)}' is outside target directory", references=[DiagnosticDocumentReference.from_value(target)])


# Atomic types

@dataclass
class FileDataRefType(Type):
  mode: FileOpenMode

  def analyze(self, obj, /, context):
    analysis, result = PrimitiveType(IOBase).analyze(obj, context.update(auto_expr=False))

    if isinstance(result, EllipsisType):
      return analysis, Ellipsis

    assert isinstance(result, LocatedValue)

    match self.mode:
      case 'read':
        if not result.value.readable():
          analysis.errors.append(InvalidFileObject(result))
          return analysis, Ellipsis
      case 'write':
        if not result.value.writable():
          analysis.errors.append(InvalidFileObject(result))
          return analysis, Ellipsis

    return analysis, EvaluableConstantValue(result) if context.auto_expr else result

class PathType(Type):
  def __init__(self, *, resolve_cwd: bool = True):
    self._resolve_cwd = resolve_cwd
    self._type = UnionType(
      PrimitiveType(PathLike),
      PrimitiveType(str)
    )

  def analyze(self, obj, /, context):
    analysis, result = self._type.analyze(obj, context.update(auto_expr=False))

    if isinstance(result, EllipsisType):
      return analysis, Ellipsis

    result = LocatedValueContainer(Path(result.value), result.area)
    return analysis, EvaluableRelativePath(result)

@dataclass
class EvaluableRelativePath(Evaluable[LocatedValue[Path]]):
  path: LocatedValue[Path]
  ensure_inside_cwd: bool = True

  def evaluate(self, context):
    # tmp
    # return LanguageServiceAnalysis(), EvaluableConstantValue(LocatedValue(Path('/root') / self.path.value, self.path.area))

    if context.cwd_path:
      path = (context.cwd_path / self.path.value).resolve()
      located_path = LocatedValueContainer(path, self.path.area)

      if self.ensure_inside_cwd and (not path.is_relative_to(context.cwd_path)):
        return DiagnosticAnalysis(errors=[PathOutsideDirError(located_path, context.cwd_path)]), Ellipsis

      return BaseAnalysis(), EvaluableConstantValue(located_path)

    return BaseAnalysis(), self


@dataclass
class PathDataRefWrapperType(DirectedType[Path]):
  mode: FileOpenMode

  def analyze(self, obj: PossiblyLocatedValue[Path], /, context):
    return BaseAnalysis(), EvaluableConstantValue(LocatedValue.new(PathDataRef(Path(obj.value), mode=self.mode), obj.area))


# Composite types

def ReadableDataRefType():
  return UnionType(
    ChainType(PathType(), PathDataRefWrapperType(mode='read')),
    FileDataRefType(mode='read')
  )

def WritableDataRefType():
  return UnionType(
    ChainType(PathType(), PathDataRefWrapperType(mode='write')),
    FileDataRefType(mode='write')
  )


__all__ = [
  'BytesDataRef',
  'DataRef',
  'EvaluableRelativePath',
  'FileDataRef',
  'FileDataRefType',
  'InvalidFileObject',
  'PathDataRef',
  'PathDataRefWrapperType',
  'PathOutsideDirError',
  'PathType',
  'ReadableDataRefType',
  'WritableDataRefType'
]

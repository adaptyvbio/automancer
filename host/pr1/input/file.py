import os
from abc import ABC, abstractmethod
from contextlib import contextmanager
from io import BytesIO, FileIO, IOBase, TextIOBase
from os import PathLike
from pathlib import Path
from types import EllipsisType
from typing import Optional

from ..error import Diagnostic, DiagnosticDocumentReference
from ..fiber.expr import Evaluable, EvaluableConstantValue
from ..langservice import LanguageServiceAnalysis
from ..reader import LocatedValue, LocatedValueContainer
from . import PrimitiveType, Type, UnionType


# Refs

class FileRef(ABC):
  """
  An abstract reference to a file-like object.
  """

  @abstractmethod
  def close_file(self):
    ...

  @abstractmethod
  def open_file(self, mode: str) -> IOBase:
    ...

  @contextmanager
  def open(self, mode: str):
    file = self.open_file(mode)

    try:
      yield file
    finally:
      self.close_file()

  def get_name(self) -> str:
    raise NotImplementedError

  @abstractmethod
  def get_size(self) -> int:
    ...


class BytesIOFileRef(FileRef):
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


class IOBaseFileRef(FileRef):
  """
  A reference to an `io.IOBase` object.
  """

  def __init__(self, file: IOBase, /):
    self._file = file

  def close_file(self):
    pass

  def open_file(self, mode: str):
    if isinstance(self._file, FileIO):
      assert self._file.mode == mode

    return self._file

  def get_size(self):
    return os.fstat(self._file.fileno()).st_size


class PathFileRef(FileRef):
  """
  A reference to a file on the filesystem.
  """

  def __init__(self, path: Path, /):
    self._file: Optional[IOBase] = None
    self._path = path

  def path(self):
    return self._path

  def close_file(self):
    assert self._file
    self._file.close()

  def open_file(self, mode: str):
    file = self._path.open(mode)

    assert isinstance(file, IOBase)
    self._file = file

    return file

  def get_name(self):
    return self._path.name

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


# Types

class FileRefType(Type):
  def __init__(self, *, text: Optional[bool] = None):
    self._text = text
    self._type = UnionType(
      PathType(),
      PrimitiveType(IOBase)
    )

  def analyze(self, obj, /, context):
    analysis, result = self._type.analyze(obj, context.update(eval_depth=0))

    if isinstance(result, EllipsisType):
      return analysis, Ellipsis

    if (self._text is not None) and isinstance(result.value, IOBase) and (isinstance(result.value, TextIOBase) != self._text):
      analysis.errors.append(InvalidFileObject(result))
      return analysis, Ellipsis

    if isinstance(result.value, Path):
      ref = PathFileRef(result.value)
    else:
      ref = IOBaseFileRef(result.value)

    return analysis, EvaluableConstantValue.new(LocatedValueContainer(ref, obj.area), depth=context.eval_depth)

class ReadableDataRefType(Type):
  def __init__(self, *, text: Optional[bool] = None):
    self._type = UnionType(
      FileRefType(text=text),
      PrimitiveType(bytes)
    )

  def analyze(self, obj, context):
    analysis, result = self._type.analyze(obj, context.update(eval_depth=0))

    if isinstance(result, EllipsisType):
      return analysis, Ellipsis

    if isinstance(result.value, bytes):
      ref = BytesIOFileRef(result.value)
    else:
      ref = result.value

    return analysis, EvaluableConstantValue.new(LocatedValueContainer(ref, obj.area), depth=context.eval_depth)

class PathType(Type):
  def __init__(self, *, resolve_cwd: bool = True):
    self._resolve_cwd = resolve_cwd
    self._type = UnionType(
      PrimitiveType(PathLike),
      PrimitiveType(str)
    )

  def analyze(self, obj, /, context):
    analysis, result = self._type.analyze(obj, context)

    if isinstance(result, EllipsisType):
      return analysis, Ellipsis

    result = LocatedValueContainer(Path(result.value), result.area)

    if context.eval_context:
      eval_analysis, eval_result = EvaluableRelativePath(result, depth=(context.eval_depth + 1)).evaluate(context.eval_context)
      return (analysis + eval_analysis), eval_result
    else:
      return analysis, EvaluableRelativePath.new(result, depth=context.eval_depth)

class EvaluableRelativePath(Evaluable[LocatedValue[Path]]):
  def __init__(self, value: LocatedValue[Path], /, *, depth: int):
    self._depth = depth
    self._ensure_inside_cwd = True
    self._path = value

  def evaluate(self, context):
    if context.cwd_path:
      path = (context.cwd_path / self._path.value).resolve()

      if self._ensure_inside_cwd and (not path.is_relative_to(context.cwd_path)):
        return LanguageServiceAnalysis(errors=[PathOutsideDirError(LocatedValueContainer(path, self._path.area), context.cwd_path)]), Ellipsis

      return LanguageServiceAnalysis(), LocatedValueContainer(path, self._path.area)

    print("Drop")
    return LanguageServiceAnalysis(), self._path

  @classmethod
  def new(cls, value: LocatedValue[Path], /, *, depth: int):
    return cls(value, depth=depth) if depth > 0 else value

class WritableDataRefType(Type):
  def __init__(self, *, text: Optional[bool] = None):
    self._type = UnionType(
      FileRefType(text=text),
      PrimitiveType(bytes)
    )

  def analyze(self, obj, context):
    analysis, result = self._type.analyze(obj, context.update(eval_depth=0))

    if isinstance(result, EllipsisType):
      return analysis, Ellipsis

    return analysis, EvaluableConstantValue.new(LocatedValueContainer(result, obj.area), depth=context.eval_depth)


__all__ = [
  'BytesIOFileRef',
  'EvaluableRelativePath',
  'FileRef',
  'FileRefType',
  'InvalidFileObject',
  'IOBaseFileRef',
  'PathFileRef',
  'PathOutsideDirError',
  'PathType',
  'ReadableDataRefType',
  'WritableDataRefType'
]

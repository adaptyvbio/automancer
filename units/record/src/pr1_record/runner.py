from asyncio import subprocess
from dataclasses import dataclass
from io import IOBase
from pathlib import Path
from types import EllipsisType
from typing import Optional
import numpy as np
import pandas as pd

from pr1.devices.claim import ClaimSymbol
from pr1.devices.node import AsyncCancelable, NodePath, PolledReadableNode, ScalarReadableNode, SubscribableReadableNode
from pr1.error import Error, ErrorDocumentReference
from pr1.fiber.eval import EvalStack
from pr1.state import StateEvent, StateInstanceNotifyCallback
from pr1.util.misc import Exportable
from pr1.reader import LocatedString
from pr1.units.base import BaseProcessRunner

from . import namespace
from .parser import RecordState


class MissingNodeError(Error):
  def __init__(self, target: LocatedString, /):
    super().__init__("Missing node", references=[ErrorDocumentReference.from_value(target)])

class InvalidNodeError(Error):
  def __init__(self, target: LocatedString, /):
    super().__init__("Invalid node", references=[ErrorDocumentReference.from_value(target)])

class InvalidDataTypeError(Error):
  def __init__(self, target: LocatedString, /):
    super().__init__("Invalid data type", references=[ErrorDocumentReference.from_value(target)])

class MissingFormatError(Error):
  def __init__(self, target: LocatedString, /):
    super().__init__("Missing format", references=[ErrorDocumentReference.from_value(target)])

class UnknownExtensionError(Error):
  def __init__(self, target: LocatedString, /):
    super().__init__("Unknown extension", references=[ErrorDocumentReference.from_value(target)])


EXTENSIONS = {
  '.csv': 'csv',
  # '.h5': 'hdf5',
  # '.hdf5': 'hdf5',
  # '.json': 'json',
  '.npy': 'npy',
  '.npz': 'npz',
  '.xlsx': 'xlsx'
}

# class RecordStateEvaluated(TypedDict):
#   command: LocatedString
#   cwd: Path
#   env: dict[str, str]
#   exit_code: BindingWriter[int]
#   halt_action: Literal['none', 'sigint', 'sigkill', 'sigterm', 'sigquit'] | int
#   ignore_exit_code: bool
#   shell: bool
#   stderr: BindingWriter[bytes]
#   stdout: BindingWriter[bytes]


@dataclass(kw_only=True)
class RecordField:
  dtype: np.dtype
  node: PolledReadableNode | SubscribableReadableNode
  reg: Optional[AsyncCancelable] = None

@dataclass
class RecordStateLocation(Exportable):
  def export(self):
    return {}

class RecordStateInstance:
  def __init__(self, state: RecordState, runner: 'Runner', *, notify: StateInstanceNotifyCallback, stack: EvalStack, symbol: ClaimSymbol):
    self._runner = runner
    self._state = state
    self._stack = stack

    self._data: list[tuple]
    self._dtype: np.dtype
    self._fields: list[RecordField]
    self._file: Path | IOBase
    self._format: str

  def _read(self):
    # TODO: Warn when overflows occur

    row = list()

    for field in self._fields:
      value = field.node.value

      if value is not None:
        row.append(value.magnitude)
      else:
        match field.dtype.kind:
          case 'i': row.append(0)
          case 'u': row.append(-1)
          case 'f': row.append(np.nan)
          case _: raise ValueError()

    self._data.append(tuple(row))

  def prepare(self, *, resume: bool):
    pass

  def apply(self, *, resume: bool):
    if not resume:
      analysis, result = self._state.data.evaluate(self._stack)
      failure = isinstance(result, EllipsisType)
      dtype_items = list[tuple]()

      self._data = list()
      self._fields = list()

      if not failure:
        self._file = result['file'].value

        if 'format' in result:
          self._format = result['format'].value
        elif isinstance(self._file, Path):
          extension = self._file.suffix.lower()

          if extension in EXTENSIONS:
            self._format = EXTENSIONS[extension]
          else:
            analysis.errors.append(UnknownExtensionError(result['file']))
            failure = True
        else:
          analysis.errors.append(MissingFormatError(result))
          failure = True

        for field_data in result['fields']:
          node_path: NodePath = field_data['value'].split(".")
          node = self._runner._host.root_node.find(node_path)
          dtype: Optional[np.dtype] = field_data['dtype'].value if 'dtype' in field_data else None
          name: Optional[str] = field_data['name'].value if 'name' in field_data else None

          if not node:
            analysis.errors.append(MissingNodeError(field_data['value']))
            failure = True
          elif not isinstance(node, (PolledReadableNode, SubscribableReadableNode)) or not isinstance(node, ScalarReadableNode):
            analysis.errors.append(InvalidNodeError(field_data['value']))
            failure = True
          elif dtype and (node.dtype.kind != dtype.kind):
            analysis.errors.append(InvalidDataTypeError(field_data['dtype']))
            failure = True
          else:
            field = RecordField(
              dtype=(dtype or node.dtype),
              node=node
            )

            dtype_items.append((name or str(), field.dtype))
            self._fields.append(field)

      if failure:
        return StateEvent(RecordStateLocation(), errors=analysis.errors, failure=True)

      self._dtype = np.dtype(dtype_items)

    for field in self._fields:
      assert not field.reg

      match field.node:
        case PolledReadableNode():
          field.reg = field.node.watch(self._read, interval=1.0)
        case SubscribableReadableNode():
          field.reg = field.node.watch(self._read)

    self._read()

    return StateEvent(RecordStateLocation(), settled=True)

  async def close(self):
    data = np.array(self._data, dtype=self._dtype)
    df = pd.DataFrame(data)

    match self._format:
      case 'csv':
        df.to_csv(self._file) # type: ignore
      case 'npy':
        # TODO: Fix the fact that it adds the .npy extension if not present
        np.save(self._file, data)
      case 'npz':
        np.savez(self._file, data)
      case 'xlsx':
        df.to_excel(self._file)

  async def suspend(self):
    for field in self._fields:
      if field.reg:
        await field.reg.cancel()
        field.reg = None

    return StateEvent(RecordStateLocation())


class Runner(BaseProcessRunner):
  StateInstance = RecordStateInstance

  def __init__(self, chip, *, host):
    self._chip = chip
    self._host = host

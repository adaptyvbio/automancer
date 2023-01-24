from asyncio import subprocess
import builtins
from pathlib import Path
import platform
import signal
from dataclasses import dataclass
from types import EllipsisType
from typing import Literal, Optional, TypedDict, cast
import asyncio

from pr1.error import Error, ErrorDocumentReference
from pr1.fiber.binding import BindingWriter
from pr1.fiber.eval import EvalStack
from pr1.fiber.process import ProcessExecEvent, ProcessFailureEvent, ProcessTerminationEvent
from pr1.util.parser import parse_command
from pr1.reader import LocatedString
from pr1.units.base import BaseProcessRunner

from . import namespace
from .parser import ProcessData


class InvalidCommandArgumentsError(Error):
  def __init__(self, target: LocatedString, /):
    super().__init__("Invalid command arguments", references=[ErrorDocumentReference.from_value(target)])

class InvalidCommandExecutableError(Error):
  def __init__(self, target: LocatedString, /):
    super().__init__("Invalid command executable", references=[ErrorDocumentReference.from_value(target)])

class NonZeroExitCodeError(Error):
  def __init__(self, exit_code: int, /):
    super().__init__(f"Non-zero exit code ({exit_code})")


# TODO: Set all but 'command' as NotRequired[...] when moving to Python 3.11
class ProcessDataEvaluated(TypedDict):
  command: LocatedString
  cwd: Path
  env: dict[str, str]
  exit_code: BindingWriter[int]
  halt_action: Literal['none', 'sigint', 'sigkill', 'sigterm', 'sigquit'] | int
  ignore_exit_code: bool
  shell: bool
  stderr: BindingWriter[bytes]
  stdout: BindingWriter[bytes]


@dataclass(kw_only=True)
class ProcessLocation:
  command: str
  pid: int

  def export(self):
    return {
      "command": self.command,
      "pid": self.pid
    }

@dataclass(kw_only=True)
class ProcessPoint:
  pass

class Process:
  def __init__(self, data: ProcessData, *, runner: 'Runner'):
    self._process_data = data
    self._runner = runner

    self._data: ProcessDataEvaluated
    self._halted = False
    self._halt_task: Optional[asyncio.Task[None]] = None
    self._process: Optional[subprocess.Process]

  def halt(self):
    self._halted = True

    if self._process:
      if platform.system() == "Windows":
        self._process.terminate()
      else:
        match self._data.get('halt_action', 'sigint'):
          # case 'eof':
          #   assert self._process.stdin
          #   self._process.stdin.close()
          case 'none':
            return
          case 'sigint':
            self._process.send_signal(signal.SIGINT)
            pass
          case 'sigkill':
            self._process.send_signal(signal.SIGKILL)
          case 'sigterm':
            self._process.send_signal(signal.SIGTERM)
          case 'sigquit':
            self._process.send_signal(signal.SIGQUIT)
          case builtins.int(signal_value):
            self._process.send_signal(signal_value)

        self._halt_task = asyncio.create_task(self._kill_task())

  async def _kill_task(self):
    try:
      await asyncio.sleep(10)

      assert self._process
      self._process.kill()
    except asyncio.CancelledError:
      pass

  async def run(self, initial_point: Optional[ProcessPoint], *, stack: EvalStack):
    analysis, data = self._process_data.data.evaluate(stack)

    if isinstance(data, EllipsisType):
      yield ProcessFailureEvent(errors=analysis.errors)
      return

    self._data = cast(ProcessDataEvaluated, data)
    command = self._data['command']

    # from pprint import pprint
    # pprint(data)

    subprocess_args = dict(
      cwd=self._data.get('cwd'),
      env=(self._data.get('env') or dict()),
      stderr=(subprocess.PIPE if 'stderr' in self._data else subprocess.DEVNULL),
      stdout=(subprocess.PIPE if 'stdout' in self._data else subprocess.DEVNULL)
    )

    if self._data.get('shell'):
      self._process = await asyncio.create_subprocess_shell(command.value, **subprocess_args)
    else:
      command_args = parse_command(command)

      if isinstance(command_args, EllipsisType):
        yield ProcessFailureEvent(errors=(analysis.errors + [InvalidCommandArgumentsError(command)]))
        return

      try:
        self._process = await asyncio.create_subprocess_exec(*command_args, **subprocess_args)
      except FileNotFoundError:
        yield ProcessFailureEvent(errors=(analysis.errors + [InvalidCommandExecutableError(command_args[0])]))
        return

    yield ProcessExecEvent(
      errors=analysis.errors,
      location=ProcessLocation(
        command=command.value,
        pid=self._process.pid
      )
    )

    stdout, stderr = await self._process.communicate()
    exit_code = self._process.returncode
    assert exit_code is not None

    # print("STDOUT", stdout)
    # print("STDERR", stderr)
    # print("Return code", exit_code)

    if self._halt_task:
      self._halt_task.cancel()

      try:
        await self._halt_task
      except asyncio.CancelledError:
        pass

      self._halt_task = None

    if (write_exit_code := self._data.get('exit_code')):
      write_exit_code(exit_code)

    if (write_stdout := self._data.get('stdout')):
      write_stdout(stdout)

    if (write_stderr := self._data.get('stderr')):
      write_stderr(stderr)

    if (not self._halted) and (exit_code != 0) and (not self._data.get('ignore_exit_code')):
      yield ProcessFailureEvent(errors=[NonZeroExitCodeError(exit_code)])

    yield ProcessTerminationEvent()


class Runner(BaseProcessRunner):
  Process = Process

  def __init__(self, chip, *, host):
    self._chip = chip

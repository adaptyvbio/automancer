from asyncio import subprocess
import builtins
from pathlib import Path
import platform
import signal
from dataclasses import dataclass
from types import EllipsisType
from typing import Optional
import asyncio

from pr1.error import Error, ErrorDocumentReference
from pr1.fiber.eval import EvalStack
from pr1.fiber.process import ProcessExecEvent, ProcessFailureEvent, ProcessTerminationEvent
from pr1.util.parser import parse_command
from pr1.reader import LocatedString, LocatedValue
from pr1.units.base import BaseProcessRunner

from . import namespace
from .parser import ProcessData


class InvalidCommandArgumentsError(Error):
  def __init__(self, target: LocatedString, /):
    super().__init__("Invalid command arguments", references=[ErrorDocumentReference.from_value(target)])

class InvalidCommandExecutableError(Error):
  def __init__(self, target: LocatedString, /):
    super().__init__("Invalid command executable", references=[ErrorDocumentReference.from_value(target)])

class MissingCwdError(Error):
  def __init__(self, target: LocatedValue[Path], /):
    super().__init__(f"Missing current working directory '{str(target.value)}'", references=[ErrorDocumentReference.from_value(target)])

class NonZeroExitCodeError(Error):
  def __init__(self, exit_code: int, /):
    super().__init__(f"Non-zero exit code ({exit_code})")


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
    self._data = data
    self._runner = runner

    self._halted = False
    self._halt_task: Optional[asyncio.Task[None]] = None
    self._process: Optional[subprocess.Process]

  def halt(self):
    self._halted = True

    if self._process:
      if platform.system() == "Windows":
        self._process.terminate()
      else:
        match self._data.halt_action:
          case 'eof':
            assert self._process.stdin
            self._process.stdin.close()
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
    # Command

    analysis, command = self._data.command.evaluate(stack)
    failure = isinstance(command, EllipsisType)

    # Env

    env = dict[str, str]()

    if isinstance(self._data.env, EllipsisType):
      pass
    else:
      for key, value in self._data.env.items():
        value_result = analysis.add(value.evaluate(stack))

        if not isinstance(value_result, EllipsisType):
          env[key] = value_result.value
        else:
          failure = True

    # Cwd

    if self._data.cwd:
      cwd_result = analysis.add(self._data.cwd.evaluate(stack))

      if not isinstance(cwd_result, EllipsisType):
        cwd = cwd_result.value

        if not cwd.exists():
          analysis.errors.append(MissingCwdError(cwd_result))
          failure = True
      else:
        cwd = None
        failure = True
    else:
      cwd = None

    # Bindings

    # if self._data.stdout:
    #   analysis += self._data.stdout.write(34, stack)

    if failure:
      yield ProcessFailureEvent(errors=analysis.errors)
      return

    assert isinstance(command, LocatedString)

    subprocess_args = dict(
      cwd=cwd,
      env=env,
      stderr=(subprocess.PIPE if self._data.stderr else subprocess.DEVNULL),
      stdout=(subprocess.PIPE if self._data.stdout else subprocess.DEVNULL)
    )

    if self._data.shell:
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

    if (exit_code is not None) and (exit_code != 0) and (not self._data.ignore_exit_code):
      yield ProcessFailureEvent(errors=[NonZeroExitCodeError(exit_code)])

    print("STDOUT", stdout)
    print("STDERR", stderr)
    print("Return code", self._process.returncode)

    # if self._data.stdout:
    #   self._data.stdout.write(stdout, context)
    # if self._data.stderr:
    #   self._data.stderr.write(stderr, context)

    yield ProcessTerminationEvent()


class Runner(BaseProcessRunner):
  Process = Process

  def __init__(self, chip, *, host):
    self._chip = chip

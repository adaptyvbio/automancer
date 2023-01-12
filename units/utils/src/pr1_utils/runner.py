from asyncio import subprocess
import builtins
import platform
import signal
from botocore.config import Config
from dataclasses import dataclass
from pathlib import Path
from types import EllipsisType
from typing import Literal, Optional
import asyncio

from pr1.fiber.eval import EvalStack
from pr1.fiber.expr import PythonExprAugmented
from pr1.fiber.process import ProcessExecEvent
from pr1.util.parser import parse_command
from pr1.reader import LocatedString
from pr1.units.base import BaseProcessRunner
from pr1.util.asyncio import AsyncIteratorThread
from pr1.util.misc import FileObject, UnreachableError

from . import namespace
from .parser import ProcessData


@dataclass(kw_only=True)
class ProcessLocation:
  pid: int

  def export(self):
    return {
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
    analysis, command = self._data.command.evaluate(stack)

    if isinstance(command, EllipsisType):
      print("Error!")
      return

    assert isinstance(command, LocatedString)

    env = dict()

    subprocess_args = dict(
      env=env,
      stderr=(subprocess.PIPE if self._data.stderr else subprocess.DEVNULL),
      stdout=(subprocess.PIPE if self._data.stdout else subprocess.DEVNULL)
    )

    if self._data.shell:
      self._process = await asyncio.create_subprocess_shell(command.value, **subprocess_args)
    else:
      command_args = parse_command(command)
      print("Args", command_args)

      if isinstance(command_args, EllipsisType):
        print("Error!")
        return

      try:
        self._process = await asyncio.create_subprocess_exec(*command_args, **subprocess_args)
      except FileNotFoundError:
        print("Error!")
        return

    yield ProcessExecEvent(
      location=ProcessLocation(pid=self._process.pid)
    )

    stdout, stderr = await self._process.communicate()

    print("STDOUT", stdout)
    print("STDERR", stderr)
    print("Return code", self._process.returncode)

    # if self._data.stdout:
    #   self._data.stdout.write(stdout, context)
    # if self._data.stderr:
    #   self._data.stderr.write(stderr, context)

    yield ProcessExecEvent(
      location=ProcessLocation(pid=self._process.pid),
      stopped=True,
      terminated=True
    )


class Runner(BaseProcessRunner):
  Process = Process

  def __init__(self, chip, *, host):
    self._chip = chip

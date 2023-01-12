from dataclasses import dataclass
from pathlib import Path
from types import EllipsisType
from typing import Literal, Optional

from pr1.fiber.binding import Binding
from pr1.fiber.expr import PythonExpr, PythonExprAugmented
from pr1.fiber.segment import SegmentTransform
from pr1.fiber.eval import EvalEnvs, EvalStack
from pr1.fiber import langservice as lang
from pr1.fiber.parser import BaseParser, BlockAttrs, BlockData, BlockUnitData, BlockUnitState
from pr1.draft import DraftGenericError
from pr1.util.decorators import debug


@dataclass(kw_only=True)
class ProcessData:
  command: PythonExprAugmented
  cwd: Optional[str]
  # env: dict[str, str]
  halt_action: Literal['eof', 'sigint', 'sigkill', 'sigquit', 'sigterm'] | int
  # ignore_exit_code: bool
  shell: bool
  stderr: Optional[Binding]
  stdout: Optional[Binding]

  def export(self):
    return {
      "type": "run",
      "command": None
    }

class Parser(BaseParser):
  namespace = "utils"

  root_attributes = dict()
  segment_attributes = {
    'run': lang.Attribute(
      lang.UnionType(
        lang.PotentialExprType(lang.StrType()),
        lang.DictType({
          'command': lang.Attribute(
            lang.PotentialExprType(lang.StrType()),
            description="The command to run."
          ),
          'cwd': lang.Attribute(
            lang.PathType(),
            description="The path to the current working directory. Defaults to the experiment's directory.",
            optional=True
          ),
          # 'env': lang.AnyType(),
          'exit_code': lang.Attribute(
            lang.BindingType(),
            optional=True
          ),
          'halt': lang.Attribute(
            lang.UnionType(
              lang.EnumType('none', 'eof', 'sigint', 'sigkill', 'sigquit', 'sigterm'),
              lang.PrimitiveType(int)
            ),
            description="The behavior to halt the process. EOF sends an end-of-file character to the standard input, which is the same Ctrl+D in most terminal emulators. All values are followed by a `SIGKILL` signal after 30 seconds. Defaults to `SIGINT`. Ignored on Windows.",
            optional=True
          ),
          'ignore_exit_code': lang.Attribute(
            lang.BoolType(),
            description="Whether to ignore non-zero exit codes. Defaults to `false`.",
            optional=True
          ),
          'shell': lang.Attribute(
            lang.BoolType(),
            description="Whether to run the command in a shell.",
            optional=True
          ),

          # Bindings
          'stderr': lang.Attribute(lang.BindingType(), optional=True),
          'stdout': lang.Attribute(lang.BindingType(), optional=True)
        })
      ),
      description="Runs a command.",
      optional=True
    )
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def parse_block(self, block_attrs, /, adoption_envs, adoption_stack, runtime_envs):
    attrs = block_attrs[self.namespace]

    if (attr := attrs.get('run')):
      if isinstance(attr, EllipsisType):
        return lang.Analysis(), Ellipsis

      analysis = lang.Analysis()

      command_raw, opts = (attr['command'].value, attr) if isinstance(attr, dict) else (attr.value, dict())
      command = analysis.add(command_raw.augment(adoption_envs).evaluate(adoption_stack))

      if isinstance(command, EllipsisType):
        return analysis, Ellipsis

      # Check if cwd exists?

      process_data = ProcessData(
        command=command.value.augment(runtime_envs),
        cwd=(opts['cwd'].value if 'cwd' in opts else None),
        halt_action=(opts['halt'].value if 'halt_action' in opts else 'sigint'),
        shell=(opts['shell'].value if 'shell' in opts else False),
        stderr=(opts['stderr'].value if 'stderr' in opts else None),
        stdout=(opts['stdout'].value if 'stdout' in opts else None)
      )

      # print(">", repr(command.value._value))
      # print(">", opts.get('stdout'))

      return analysis, BlockUnitData(transforms=[SegmentTransform(self.namespace, process_data)])

    return lang.Analysis(), BlockUnitData()

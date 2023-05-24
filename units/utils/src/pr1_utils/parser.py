from dataclasses import dataclass
from types import EllipsisType
from typing import TypedDict

from pr1.fiber.expr import Evaluable
from pr1 import input as lang
from pr1.fiber.parser import BaseParser, BlockUnitData
from pr1.reader import LocatedDict, LocatedString, LocationArea


@dataclass(kw_only=True)
class ProcessData:
  command: Evaluable[LocatedString]
  data: lang.SimpleDictAsPythonExpr

  def export(self):
    return {
      "type": "run",
      "command": self.command.export()
    }

class Attributes(TypedDict, total=False):
  run: Evaluable[LocatedDict]

class Parser(BaseParser):
  namespace = "utils"

  root_attributes = dict()
  segment_attributes = {
    'run': lang.Attribute(
      decisive=True,
      type=lang.UnionType(
        lang.PotentialExprType(lang.StrType()),
        lang.EvaluableContainerType(lang.SimpleDictType({
          'command': lang.Attribute(
            lang.PotentialExprType(lang.StrType()),
            description="The command to run."
          ),
          'cwd': lang.Attribute(
            lang.PotentialExprType(lang.PathType()),
            description="The path to the current working directory. Defaults to the experiment's directory."
          ),
          'env': lang.Attribute(
            lang.PotentialExprType(lang.KVDictType(lang.PotentialExprType(lang.StrType())))
          ),
          'exit_code': lang.Attribute(
            lang.BindingType()
          ),
          'halt': lang.Attribute(
            lang.UnionType(
              lang.EnumType('none', 'sigint', 'sigkill', 'sigquit', 'sigterm'),
              lang.PrimitiveType(int)
            ),
            description="The behavior used to halt the process. All values are followed by a `SIGKILL` signal after 30 seconds. Defaults to `SIGINT`. Ignored on Windows."
          ),
          'ignore_exit_code': lang.Attribute(
            lang.PotentialExprType(lang.BoolType()),
            description="Whether to ignore non-zero exit codes. Defaults to `false`."
          ),
          'shell': lang.Attribute(
            lang.PotentialExprType(lang.BoolType()),
            description="Whether to run the command in a shell."
          ),
          'stderr': lang.Attribute(lang.BindingType()),
          'stdout': lang.Attribute(lang.BindingType())
        }), depth=1)
      ),
      description="Runs a command."
    )
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def parse_block(self, attrs: Attributes, /, adoption_stack, trace):
    if (attr := attrs.get('run')):
      analysis, result = attr.evaluate(adoption_stack)

      if isinstance(result, EllipsisType):
        return analysis, Ellipsis

      if isinstance(result, LocatedDict):
        process_data = ProcessData(
          command=result['command'],
          data=lang.SimpleDictAsPythonExpr(result, depth=1)
        )

      else:
        process_data = ProcessData(
          command=result,
          data=lang.SimpleDictAsPythonExpr(LocatedDict({ 'command': result }, LocationArea()), depth=1)
        )

      return analysis, BlockUnitData(transforms=[SegmentTransform(self.namespace, process_data)])

    return lang.Analysis(), BlockUnitData()

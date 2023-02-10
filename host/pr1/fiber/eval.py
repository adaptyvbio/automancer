from dataclasses import KW_ONLY, dataclass, field
from pathlib import Path
from typing import Any, Optional, Protocol

from ..error import Error, ErrorDocumentReference
from ..draft import DraftDiagnostic
from ..reader import LocatedString, LocatedValue, LocationArea


@dataclass(kw_only=True)
class EvalEnv:
  readonly: bool = False

  def __hash__(self):
    return id(self)

EvalEnvs = list[EvalEnv]
EvalVariables = dict[str, Any]
EvalStack = dict[EvalEnv, Optional[EvalVariables]]

@dataclass
class EvalContext:
  stack: EvalStack
  _: KW_ONLY
  cwd_path: Optional[Path]

@dataclass
class EvalOptions:
  variables: EvalVariables = field(default_factory=EvalVariables)

class EvalError(Exception, Error):
  def __init__(self, area: LocationArea, /, message: str):
    Exception.__init__(self)
    Error.__init__(self, f"Evaluation error: {message}", references=[ErrorDocumentReference.from_area(area)])

    self.area = area


def evaluate(compiled: Any, /, contents: LocatedString, options: EvalOptions):
  try:
    return LocatedValue.new(eval(compiled, globals(), options.variables), area=contents.area, deep=True)
  except Exception as e:
    raise EvalError(contents.area, message=f"{e} ({e.__class__.__name__})") from e

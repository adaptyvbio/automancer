from dataclasses import dataclass
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

class EvalContext:
  def __init__(self, variables: Optional[EvalVariables] = None, /):
    self.variables = variables or dict()

class EvalError(Exception, Error):
  def __init__(self, area: LocationArea, /, message: str):
    Exception.__init__(self)
    Error.__init__(self, f"Evaluation error: {message}", references=[ErrorDocumentReference.from_area(area)])

    self.area = area

  def diagnostic(self):
    assert self.__cause__

    return DraftDiagnostic(str(self.__cause__), ranges=self.area.ranges)


def evaluate(compiled: Any, /, contents: LocatedString, context: EvalContext):
  try:
    return LocatedValue.new(eval(compiled, globals(), context.variables), area=contents.area, deep=True)
  except Exception as e:
    raise EvalError(contents.area, message=str(e)) from e

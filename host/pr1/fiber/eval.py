from dataclasses import KW_ONLY, dataclass, field
from pathlib import Path
from typing import Any, Optional

from ..error import Diagnostic, DiagnosticDocumentReference
from ..reader import LocatedString, LocatedValue, LocationArea
from ..staticanalysis.expr import ComplexVariable
from ..staticanalysis.types import TypeInstance, UnknownDef


@dataclass(kw_only=True)
class EvalEnvValue(ComplexVariable):
  deprecated: bool = False
  description: Optional[str] = None
  type: TypeInstance = field(default_factory=(lambda: UnknownDef()))

@dataclass
class EvalEnv:
  values: dict[str, EvalEnvValue] = field(default_factory=dict)
  _: KW_ONLY
  name: Optional[str] = None
  readonly: bool = False

  def instantiate(self):
    return EvalEnvInstance(self)

  def __hash__(self):
    return id(self)

  def __repr__(self):
    return f"{self.__class__.__name__}(name={self.name!r})"

@dataclass
class EvalEnvInstance:
  env: EvalEnv

  def __hash__(self):
    return id(self)

EvalEnvs = list[EvalEnv]
EvalVariables = dict[str, Any]
EvalStack = dict[EvalEnv, Optional[EvalVariables]]

@dataclass
class EvalContext:
  stack: EvalStack
  _: KW_ONLY
  cwd_path: Optional[Path] = None

@dataclass
class EvalOptions:
  variables: EvalVariables = field(default_factory=EvalVariables)

# @deprecated
class EvalError(Diagnostic, Exception):
  def __init__(self, area: LocationArea, /, message: str):
    Exception.__init__(self)
    Diagnostic.__init__(self, f"Evaluation error: {message}", references=[DiagnosticDocumentReference.from_area(area)])


def evaluate(compiled: Any, /, contents: LocatedString, options: EvalOptions):
  try:
    return LocatedValue.new(eval(compiled, globals(), options.variables), area=contents.area, deep=True)
  except Exception as e:
    raise EvalError(contents.area, message=f"{e} ({e.__class__.__name__})") from e

from dataclasses import KW_ONLY, dataclass, field
from pathlib import Path
from typing import Any, NewType, Optional

from ..error import Diagnostic, DiagnosticDocumentReference
from ..reader import LocatedString, LocatedValue, LocationArea
from ..staticanalysis.expr import BaseExprDefFactory


@dataclass
class EvalEnvValue:
  ExprDefFactory: BaseExprDefFactory
  _: KW_ONLY
  deprecated: bool = False
  description: Optional[str] = None

@dataclass
class EvalEnv:
  values: dict[str, EvalEnvValue] = field(default_factory=dict)
  _: KW_ONLY
  name: Optional[str] = None
  readonly: bool = False
  symbol: 'EvalSymbol'

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
EvalSymbol = NewType('EvalSymbol', int)
EvalStack = dict[EvalSymbol, Any]

@dataclass
class EvalContext:
  stack: Optional[EvalStack]
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

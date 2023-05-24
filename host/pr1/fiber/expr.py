from abc import ABC, abstractmethod
import ast
import builtins
import functools
import re
from enum import Enum
from pint import Quantity
from types import EllipsisType, NoneType
from typing import TYPE_CHECKING, Any, Callable, Generic, Literal, Optional, Protocol, TypeVar, cast, overload

from ..langservice import LanguageServiceAnalysis

from ..error import Diagnostic, DiagnosticDocumentReference
from ..host import logger
from .staticanalysis import PreludeVariables, StaticAnalysisContext, StaticAnalysisMetadata, evaluate_expr_type
from .eval import EvalContext, EvalOptions, EvalEnv, EvalEnvs, EvalError, EvalStack, EvalVariables, evaluate as dynamic_evaluate
from .staticeval import evaluate as static_evaluate
from ..reader import LocatedString, LocatedValue, LocationArea, PossiblyLocatedValue
from ..util.decorators import debug
from ..util.misc import Exportable, log_exception

if TYPE_CHECKING:
  from ..input import Type


expr_regexp = re.compile(r"([$@%])?{{((?:\\.|[^\\}]|}(?!}))*)}}")
expr_regexp_exact = re.compile(fr"^{expr_regexp.pattern}$")
escape_regexp = re.compile(r"\\(.)")

def unescape(value: LocatedString) -> LocatedString:
  # Complex replacement of escape_regexp.sub(r"\1", value))

  output = str()
  pos = 0

  for match in escape_regexp.finditer(value):
    span = match.span()
    group_span = match.span(1)

    # The result of the addition is a LocatedString because the RHS is a LocatedString.
    output += value[pos:span[0]]
    output += value[group_span[0]:group_span[1]]

    pos = span[1]

  output += value[pos:]
  return cast(LocatedString, output)


def export_value(value: Any, /):
  if isinstance(value, LocatedValue):
    return export_value(value.value)

  match value:
    case builtins.bool():
      return {
        "type": "boolean",
        "value": value
      }
    case builtins.float() | builtins.int():
      return {
        "type": "number",
        "value": value
      }
    case builtins.str():
      return {
        "type": "string",
        "value": value
      }
    case EllipsisType():
      return {
        "type": "ellipsis"
      }
    case NoneType():
      return {
        "type": "none"
      }
    case Exportable():
      return value.export()
    case Quantity():
      return {
        "type": "quantity",
        "dimensionality": dict(value.units.dimensionality), # type: ignore
        "formatted": f"{value:~#H}",
        "magnitude": (value.to_base_units().magnitude * 1000) # type: ignore
      }
    case _:
      return {
        "type": "unknown"
      }


class PythonSyntaxError(Diagnostic, Exception):
  def __init__(self, message: str, target: LocatedValue, /):
    Exception.__init__(self, message)
    Diagnostic.__init__(
      self,
      message,
      references=[DiagnosticDocumentReference.from_value(target)]
    )


class PythonExprKind(Enum):
  Field = 0
  Static = 1
  Dynamic = 2
  Binding = 3


class PythonExpr:
  def __init__(self, contents: LocatedString, kind: PythonExprKind, tree: ast.Expression):
    self.contents = contents
    self.kind = kind
    self.tree = tree

  @functools.cached_property
  def _compiled(self):
    return compile(self.tree, filename="<string>", mode="eval")

  def evaluate(self, options: EvalOptions, mode: Literal['static', 'dynamic'] = 'dynamic'):
    match mode:
      case 'dynamic':
        return dynamic_evaluate(self._compiled, self.contents, options)
      case 'static':
        return static_evaluate(self.tree.body, self.contents, options)

  def export(self):
    return {
      "type": "expression",
      "contents": self.contents.value
    }

  def __repr__(self):
    return f"{self.__class__.__name__}({repr(ast.unparse(self.tree))})"

  @classmethod
  def _parse_match(cls, match: re.Match):
    from ..input import LanguageServiceAnalysis

    match match.group(1):
      case None:
        kind = PythonExprKind.Field
      case "$":
        kind = PythonExprKind.Static
      case "%":
        kind = PythonExprKind.Dynamic
      case "@":
        kind = PythonExprKind.Binding
      case _:
        raise ValueError()

    analysis = LanguageServiceAnalysis()
    contents = unescape(LocatedString.from_match_group(match, 2).strip())

    try:
      tree = ast.parse(contents, mode='eval')
    except SyntaxError as e:
      target = contents.index_syntax_error(e)
      analysis.errors.append(PythonSyntaxError(e.msg, target))

      return analysis, Ellipsis

    return analysis, cls(
      contents=contents,
      kind=kind,
      tree=tree
    )

  @classmethod
  def parse(cls, raw_str: LocatedString, /):
    match = expr_regexp_exact.search(raw_str)

    if not match:
      return None

    return cls._parse_match(match)

  @classmethod
  def parse_mixed(cls, raw_str: LocatedString, /):
    from ..langservice import LanguageServiceAnalysis

    analysis = LanguageServiceAnalysis()
    output = list()

    index = 0

    for match in expr_regexp.finditer(raw_str):
      match_start, match_end = match.span()

      output.append(raw_str[index:match_start])
      index = match_end

      match_analysis, match_expr = cls._parse_match(match)
      analysis += match_analysis
      output.append(match_expr)

    output.append(raw_str[index:])

    return analysis, output


T = TypeVar('T', bound=PossiblyLocatedValue, covariant=True)

class Evaluable(Exportable, ABC, Generic[T]):
  @abstractmethod
  def evaluate(self, context: EvalContext) -> 'tuple[LanguageServiceAnalysis, Evaluable[T] | T | EllipsisType]':
    ...

  @overload
  def eval(self, context: EvalContext, *, final: Literal[False]) -> 'tuple[LanguageServiceAnalysis, Evaluable[T] | EllipsisType]':
    ...

  @overload
  def eval(self, context: EvalContext, *, final: Literal[True]) -> 'tuple[LanguageServiceAnalysis, T | EllipsisType]':
    ...

  # @overload
  # def eval(self, context: EvalContext, *, final: Optional[bool] = None) -> 'tuple[LanguageServiceAnalysis, Evaluable[T] | T | EllipsisType]':
  #   ...

  def eval(self, context: EvalContext, *, final: bool):
    return self.evaluate(context) # type: ignore

  def export(self):
    raise NotImplementedError


class PythonExprObject(Evaluable[LocatedValue[Any]]):
  """
  A wrapper around `PythonExpr` which provides pre- and post-evaluation analysis.
  """

  def __init__(self, expr: PythonExpr, /, type: 'Type', *, depth: int, envs: EvalEnvs):
    """
    Parameters
      depth: The post-evaluation depth of the expression. A depth of 0 means that `evaluate()` will return the evaluation's result directly, otherwise it will a return a `ValueAsPythonExpr` instance.
      envs: The evaluation environments of the expression, used for static analysis and evaluation.
      expr: The `PythonExpr` instance to wrap.
      type: The type of the expression, used after evaluation.
    """

    self._depth = depth
    self._envs = envs
    self._expr = expr
    self._type = type

    self.metadata = dict[str, StaticAnalysisMetadata]()

  def analyze(self):
    from ..langservice import LanguageServiceAnalysis

    variables = EvalVariables()

    for env in self._envs:
      variables |= { name: value.type for name, value in env.values.items() }

    try:
      static_analysis, result_type = evaluate_expr_type(self._expr.tree.body, variables, StaticAnalysisContext(
        input_value=self._expr.contents,
        prelude=PreludeVariables
      ))
    except Exception:
      log_exception(logger)
      return LanguageServiceAnalysis()

    self.metadata = static_analysis.metadata

    return LanguageServiceAnalysis(
      errors=static_analysis.errors,
      warnings=static_analysis.warnings
    )

  def evaluate(self, context):
    from ..input import LanguageServiceAnalysis
    from .parser import AnalysisContext

    variables = dict[str, Any]()

    for env in self._envs:
      if (env_vars := context.stack[env]) is not None:
        variables.update(env_vars)

    options = EvalOptions(variables)

    try:
      result = self._expr.evaluate(options)
    except EvalError as e:
      return LanguageServiceAnalysis(errors=[e]), Ellipsis
    else:
      analysis, result = self._type.analyze(result, AnalysisContext(eval_context=context, symbolic=True))
      return analysis, ValueAsPythonExpr.new(result, depth=self._depth)

  def export(self):
    return self._expr.export()

  def __repr__(self):
    return f"{self.__class__.__name__}({repr(self._expr)}, depth={self._depth})"


S = TypeVar('S', bound=(Evaluable | PossiblyLocatedValue))

class ValueAsPythonExpr(Evaluable[S], Generic[S]):
  def __init__(self, value: S | EllipsisType, /, *, depth: int):
    self._depth = depth
    self._value = value

  def evaluate(self, context):
    from ..langservice import LanguageServiceAnalysis
    return LanguageServiceAnalysis(), self._value if self._depth < 1 else ValueAsPythonExpr(self._value, depth=(self._depth - 1))

  def export(self):
    return export_value(self._value)

  def value(self):
    return cast(LocatedValue, self._value)

  def __repr__(self):
    return f"{self.__class__.__name__}({repr(self._value)}, depth={(self._depth + 1)})"

  @classmethod
  def new(cls, value: S | EllipsisType, /, *, depth: int = 0):
    return cls(value, depth=(depth - 1)) if (depth > 0) and (not isinstance(value, EllipsisType)) else value


if __name__ == "__main__":
  from ..reader import Source
  print(PythonExpr.parse(Source("${{ 1 + 2 }}")))
  print(PythonExpr.parse_mixed(Source(r"x{{ '\}}\\'xx' + 2 }}y")))
  print(PythonExpr.parse_mixed(Source("a {{ x }} b {{ y }} c")))

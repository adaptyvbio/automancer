import ast
import builtins
import functools
import re
from enum import Enum
from pint import Quantity
from types import EllipsisType
from typing import TYPE_CHECKING, Any, Callable, Literal, Optional, Protocol, cast

from .eval import EvalContext, EvalEnv, EvalEnvs, EvalError, EvalStack, EvalVariables, evaluate as dynamic_evaluate
from .staticeval import evaluate as static_evaluate
from ..draft import DraftDiagnostic
from ..reader import LocatedString, LocatedValue, LocationArea
from ..util.decorators import debug
from ..util.misc import Exportable

if TYPE_CHECKING:
  from .langservice import Analysis, Type


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
    case Exportable():
      return value.export()
    case Quantity(magnitude=magnitude, units=unit):
      return {
        "type": "quantity",
        "formatted": f"{value:~.2fP}",
        "magnitude": magnitude,
        "unit_formatted": f"{unit:~P}"
      }
    case _:
      return {
        "type": "unknown"
      }


class PythonSyntaxError(Exception):
  def __init__(self, message, target):
    self.message = message
    self.target = target

  def diagnostic(self):
    return DraftDiagnostic(self.message, ranges=self.target.area.ranges)


class PythonExprKind(Enum):
  Field = 0
  Static = 1
  Dynamic = 2
  Binding = 3


class PotentialPythonExpr(Exportable, Protocol):
  def __init__(self):
    self.type: Optional[Type]

  def augment(self) -> 'PythonExprAugmented':
    ...

  def evaluate(self, context: EvalContext) -> 'tuple[Analysis, LocatedValue]':
    ...


class PythonExpr:
  def __init__(self, contents: LocatedString, kind: PythonExprKind, tree: ast.Expression):
    self.contents = contents
    self.kind = kind
    self.tree = tree

  @functools.cached_property
  def _compiled(self):
    return compile(self.tree, filename="<string>", mode="eval")

  def evaluate(self, context: EvalContext, mode: Literal['static', 'dynamic'] = 'dynamic'):
    match mode:
      case 'dynamic':
        return dynamic_evaluate(self._compiled, self.contents, context)
      case 'static':
        return static_evaluate(self.tree.body, self.contents, context)

  def export(self):
    return {
      "type": "expression",
      "contents": self.contents.value
    }

  def __repr__(self):
    return f"{self.__class__.__name__}({repr(ast.unparse(self.tree))})"

  @classmethod
  def _parse_match(cls, match: re.Match):
    from .langservice import Analysis

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

    analysis = Analysis()
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
    from .langservice import Analysis

    match = expr_regexp_exact.search(raw_str)

    if not match:
      return None

    return cls._parse_match(match)

  @classmethod
  def parse_mixed(cls, raw_str: LocatedString, /):
    from .langservice import Analysis

    analysis = Analysis()
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

class PythonExprObject:
  def __init__(self, expr: PythonExpr, /, type: 'Type'):
    self._expr = expr
    self._type = type

  def evaluate(self, envs, stack, *, done):
    from .langservice import Analysis
    from .parser import AnalysisContext

    variables = dict[str, Any]()

    for env in envs:
      if (env_vars := stack[env]) is not None:
        variables.update(env_vars)

    context = EvalContext(variables)

    try:
      result = self._expr.evaluate(context)
    except EvalError as e:
      return Analysis(errors=[e]), Ellipsis
    else:
      return self._type.analyze(result, AnalysisContext(symbolic=True))

  def __repr__(self):
    return f"{self.__class__.__name__}({repr(self._expr)})"


class ValueAsPythonExpr:
  def __init__(self, value: LocatedValue | EllipsisType, /):
    self.type = None
    self._value = value

  def evaluate(self, envs, stack, *, done):
    from .langservice import Analysis
    return Analysis(), self._value

  def export(self):
    return export_value(self._value)

  def __repr__(self):
    return f"{self.__class__.__name__}({repr(self._value)})"


class PythonExprAugmented:
  def __init__(self, expr: PotentialPythonExpr, /, envs: EvalEnvs):
    self._expr = expr
    self._envs = envs

  def evaluate(self, stack: EvalStack):
    from .langservice import Analysis
    from .parser import AnalysisContext

    variables = dict[str, Any]()

    for env in self._envs:
      if (env_vars := stack[env]) is not None:
        variables.update(env_vars)

    context = EvalContext(variables)

    try:
      result = self._expr.evaluate(context)
    except EvalError as e:
      return Analysis(errors=[e]), Ellipsis
    else:
      if self._expr.type:
        return self._expr.type.analyze(result, AnalysisContext(symbolic=True))
      else:
        return Analysis(), result

  def export(self):
    return self._expr.export()


if __name__ == "__main__":
  from ..reader import Source
  print(PythonExpr.parse(Source("${{ 1 + 2 }}")))
  print(PythonExpr.parse_mixed(Source(r"x{{ '\}}\\'xx' + 2 }}y")))
  print(PythonExpr.parse_mixed(Source("a {{ x }} b {{ y }} c")))

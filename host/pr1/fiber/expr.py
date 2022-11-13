import ast
import functools
import re
from enum import Enum
from typing import Literal, Optional, cast

from .eval import EvalContext, EvalEnv, EvalError, EvalStack, EvalVariables, evaluate as dynamic_evaluate
from .staticeval import evaluate as static_evaluate
from ..draft import DraftDiagnostic
from ..reader import LocatedString
from ..util.decorators import debug


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


class PythonExpr:
  def __init__(self, contents: LocatedString, kind: PythonExprKind, tree: ast.Expression):
    self.contents = contents
    self.kind = kind
    self.tree = tree

  @functools.cached_property
  def compiled(self):
    return compile(self.tree, filename="<string>", mode="eval")

  def evaluate(self, context: EvalContext, mode: Literal['static', 'dynamic'] = 'dynamic'):
    match mode:
      case 'dynamic':
        return dynamic_evaluate(self.compiled, self.contents, context)
      case 'static':
        return static_evaluate(self.tree.body, self.contents, context)

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
  def parse(cls, raw_str: LocatedString):
    from .langservice import Analysis

    match = expr_regexp_exact.search(raw_str)

    if not match:
      return None

    return cls._parse_match(match)

  @classmethod
  def parse_mixed(cls, raw_str: LocatedString):
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


class PythonExprEvaluator:
  def __init__(self, expr: PythonExpr, /, type):
    self._expr = expr
    self._type = type

    self.envs: Optional[list[EvalEnv]] = None

  def evaluate(self, stack: EvalStack, ctx = None):
    from .langservice import Analysis
    assert self.envs is not None

    variables = dict()

    for env in self.envs:
      if stack[env] is not None:
        variables.update(stack[env])

    context = EvalContext(variables)

    try:
      result = self._expr.evaluate(context, mode='dynamic')
    except EvalError as e:
      return Analysis(errors=[e]), Ellipsis
    else:
      return self._type.analyze(result, context)

  def export(self):
    return dict()


if __name__ == "__main__":
  from ..reader import Source
  print(PythonExpr.parse(Source("${{ 1 + 2 }}")))
  print(PythonExpr.parse_mixed(Source(r"x{{ '\}}\\'xx' + 2 }}y")))
  print(PythonExpr.parse_mixed(Source("a {{ x }} b {{ y }} c")))

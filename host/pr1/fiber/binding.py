from dataclasses import dataclass
from types import EllipsisType
from typing import Any, Optional, Protocol
import ast

from ..draft import DraftDiagnostic
from .eval import EvalContext, EvalVariables
from .expr import PythonExpr, PythonExprKind
from .langservice import Analysis, LangServiceError
from ..reader import LocatedString, Source


@dataclass(kw_only=True)
class BindingWriteContext:
  background: EvalVariables
  present: EvalVariables

  @property
  def eval_context(self):
    return EvalContext(self.background | self.present)

  @classmethod
  def from_eval_context(cls, context: EvalContext, /):
    return cls(
      background=context.variables,
      present=dict()
    )

class InvalidBindingPythonExpr(LangServiceError):
  def __init__(self, target):
    self.target = target

  def diagnostic(self):
    return DraftDiagnostic("Invalid binding expression", ranges=self.target.area.ranges)


class Binding(Protocol):
  def write(self, value: Any, /, context: BindingWriteContext) -> Analysis:
    ...

  @staticmethod
  def parse(source: LocatedString, /, tree: Optional[ast.Expression] = None) -> 'tuple[Analysis, Binding | EllipsisType]':
    tree = tree or ast.parse(source, mode='eval')
    print(ast.dump(tree, indent=2))

    try:
      return Analysis(), parse_binding_expr(tree.body, source=source)
    except InvalidBindingPythonExpr as e:
      return Analysis(errors=[e]), Ellipsis


@dataclass(kw_only=True)
class AttributeBinding(Binding):
  attribute: str
  target: PythonExpr

  def write(self, value, /, context):
    analysis = Analysis()
    target_result = self.target.evaluate(context.eval_context)

    setattr(target_result.value, self.attribute, value)

    return analysis

@dataclass(kw_only=True)
class DestructuringBinding(Binding):
  after_starred: list[Binding]
  before_starred: list[Binding]
  starred: Optional[Binding]

  def write(self, value, /, context):
    analysis = Analysis()

    for index, binding in enumerate(self.before_starred):
      analysis += binding.write(value[index], context)

    if self.starred:
      analysis += self.starred.write(value[len(self.before_starred):-len(self.after_starred)], context)

    for index, binding in enumerate(self.after_starred):
      analysis += binding.write(value[-index - 1], context)

    return analysis

@dataclass(kw_only=True)
class NamedBinding(Binding):
  name: str

  def write(self, value, /, context):
    context.present[self.name] = value
    return Analysis()

@dataclass(kw_only=True)
class NullBinding(Binding):
  def write(self, value, /, context):
    return Analysis()

@dataclass(kw_only=True)
class SubscriptBinding(Binding):
  slice: PythonExpr
  target: PythonExpr

  def write(self, value, /, context):
    slice_result = self.slice.evaluate(context.eval_context)
    target_result = self.target.evaluate(context.eval_context)

    target_result.value[slice_result.value] = value

    return Analysis()


def parse_binding_expr(expr: ast.expr, *, source: LocatedString):
  match expr:
    case ast.Attribute(attr=attribute, ctx=ast.Load(), value=target_expr):
      return AttributeBinding(
        attribute=attribute,
        target=PythonExpr(
          source.index_ast_node(target_expr),
          kind=PythonExprKind.Dynamic,
          tree=ast.Expression(target_expr),
          type=None
        )
      )

    case ast.Name(ctx=ast.Load(), id="_"):
      return NullBinding()

    case ast.Name(ctx=ast.Load(), id=name):
      return NamedBinding(name=name)

    case ast.Subscript(ctx=ast.Load(), slice=slice_expr, value=target_expr):
      return SubscriptBinding(
        slice=PythonExpr(
          source.index_ast_node(slice_expr),
          kind=PythonExprKind.Static,
          tree=ast.Expression(slice_expr)
        ),
        target=PythonExpr(
          source.index_ast_node(target_expr),
          kind=PythonExprKind.Dynamic,
          tree=ast.Expression(target_expr)
        )
      )

    case ast.Tuple(ctx=ast.Load(), elts=items):
      before_starred = list[Binding]()
      after_starred = list[Binding]()
      starred: Optional[Binding] = None

      for item in items:
        match item:
          case ast.Starred(ctx=ast.Load(), value=item_value) if not starred:
            starred = parse_binding_expr(item_value, source=source)
          case _:
            binding = parse_binding_expr(item, source=source)

            if starred:
              after_starred.append(binding)
            else:
              before_starred.append(binding)

      return DestructuringBinding(
        after_starred=after_starred,
        before_starred=before_starred,
        starred=starred
      )

    case _:
      raise InvalidBindingPythonExpr(source.index_ast_node(expr))


if __name__ == "__main__":
  import ast

  library = dict(
    x=[0, 1, 2, 3]
  )

  context = BindingWriteContext.from_eval_context(EvalContext({
    'a': [0, 1, 2, 3]
  }))

  _, x = Binding.parse(Source("{ **x, 'y': y, 'z': z }"))
  assert isinstance(x, Binding)

  print(x)

  x.write([5, 6, 7, 8], context)
  print(context.eval_context.variables)

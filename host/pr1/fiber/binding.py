from abc import abstractmethod
from dataclasses import dataclass
from types import EllipsisType
from typing import Any, Callable, Optional, Protocol, TypeVar
import ast

from ..error import Error, ErrorDocumentReference
from .eval import EvalEnv, EvalEnvs, EvalStack
from .expr import Evaluable, PythonExpr, PythonExprKind, PythonExprObject
from .langservice import Analysis, AnyType, HasAttrType
from ..reader import LocatedString, LocatedValue, Source


class InvalidBindingPythonExpr(Error, Exception):
  def __init__(self, target: LocatedValue, /):
    super().__init__("Invalid binding expression", references=[ErrorDocumentReference.from_value(target)])


T = TypeVar('T', contravariant=True)

class BindingWriter(Protocol[T]):
  def __call__(self, value: T):
    ...

class Binding(Evaluable):
  @abstractmethod
  def evaluate(self, stack: EvalStack) -> 'tuple[Analysis, BindingWriter | EllipsisType]':
    ...

  def export(self):
    raise NotImplementedError

  @staticmethod
  def parse(source: LocatedString, /, tree: Optional[ast.Expression] = None, *, envs: EvalEnvs, write_env: EvalEnv) -> 'tuple[Analysis, Binding | EllipsisType]':
    tree = tree or ast.parse(source, mode='eval')

    try:
      return Analysis(), parse_binding_expr(tree.body, envs=envs, source=source, write_env=write_env)
    except InvalidBindingPythonExpr as e:
      return Analysis(errors=[e]), Ellipsis


@dataclass(kw_only=True)
class AttributeBinding(Binding):
  attribute: str
  target: PythonExprObject

  def evaluate(self, stack):
    analysis, target = self.target.evaluate(stack)
    assert isinstance(target, LocatedValue)

    if isinstance(target, EllipsisType):
      return analysis, Ellipsis

    def write(value, /):
      setattr(target.value, self.attribute, value)

    return analysis, write

@dataclass(kw_only=True)
class DestructuringBinding(Binding):
  after_starred: list[Binding]
  before_starred: list[Binding]
  starred: Optional[Binding]

  def evaluate(self, stack):
    analysis = Analysis()

    before_starred = [analysis.add(binding.evaluate(stack)) for binding in self.before_starred]
    starred = analysis.add(self.starred.evaluate(stack)) if self.starred else None
    after_starred = [analysis.add(binding.evaluate(stack)) for binding in self.after_starred]

    if any(isinstance(binding, EllipsisType) for binding in before_starred + after_starred + [starred]):
      return analysis, Ellipsis

    # def evaluate_bindings(bindings: list[Binding]):
    #   nonlocal analysis

    #   writers = list[BindingWriter]()
    #   failure = False

    #   for binding in bindings:
    #     writer = analysis.add(binding.evaluate(stack))

    #     if not isinstance(writer, EllipsisType):
    #       writers.append(writer)
    #     else:
    #       failure = True

    #   return writers if not failure else Ellipsis

    # before_starred = evaluate_bindings(self.before_starred)
    # after_starred = evaluate_bindings(self.after_starred)
    # starred = evaluate_bindings([self.starred] if self.starred else list()) # if self.starred else None

    def write(value: tuple, /):
      for index, writer in enumerate(before_starred):
        writer(value[index]) # type: ignore

      if starred:
        starred[0](value[len(before_starred):-len(after_starred)]) # type: ignore

      for index, writer in enumerate(after_starred):
        writer(value[-index - 1]) # type: ignore

    return analysis, write

@dataclass(kw_only=True)
class NamedBinding(Binding):
  env: EvalEnv
  name: str

  def __post_init__(self):
    assert not self.env.readonly

  def evaluate(self, stack):
    def write(value, /):
      vars = stack[self.env]
      assert vars is not None

      vars[self.name] = value

    return Analysis(), write

@dataclass(kw_only=True)
class NullBinding(Binding):
  def evaluate(self, stack):
    def write(value, /):
      pass

    return Analysis(), write

@dataclass(kw_only=True)
class SubscriptBinding(Binding):
  slice: PythonExprObject
  target: PythonExprObject

  def evaluate(self, stack):
    analysis = Analysis()

    slice_result = analysis.add(self.slice.evaluate(stack))
    target_result = analysis.add(self.target.evaluate(stack))

    if isinstance(slice_result, EllipsisType) or isinstance(target_result, EllipsisType):
      return analysis, Ellipsis

    def write(self, value, /):
      target_result.value[slice_result.value] = value

    return Analysis(), write


def parse_binding_expr(expr: ast.expr, *, envs: EvalEnvs, source: LocatedString, write_env: EvalEnv):
  match expr:
    case ast.Attribute(attr=attribute, ctx=ast.Load(), value=target_expr):
      return AttributeBinding(
        attribute=attribute,
        target=PythonExprObject(
          PythonExpr(
            source.index_ast_node(target_expr),
            kind=PythonExprKind.Dynamic,
            tree=ast.Expression(target_expr)
          ),
          depth=0,
          envs=envs,
          type=HasAttrType(attribute)
        )
      )

    case ast.Name(ctx=ast.Load(), id="_"):
      return NullBinding()

    case ast.Name(ctx=ast.Load(), id=name):
      return NamedBinding(
        env=write_env,
        name=name
      )

    case ast.Subscript(ctx=ast.Load(), slice=slice_expr, value=target_expr):
      return SubscriptBinding(
        slice=PythonExprObject(
          PythonExpr(
            source.index_ast_node(slice_expr),
            kind=PythonExprKind.Static,
            tree=ast.Expression(slice_expr)
          ),
          depth=0,
          envs=envs,
          type=AnyType()
        ),
        target=PythonExprObject(
          PythonExpr(
            source.index_ast_node(target_expr),
            kind=PythonExprKind.Dynamic,
            tree=ast.Expression(target_expr)
          ),
          depth=0,
          envs=envs,
          type=HasAttrType('__setitem__')
        )
      )

    case ast.Tuple(ctx=ast.Load(), elts=items):
      before_starred = list[Binding]()
      after_starred = list[Binding]()
      starred: Optional[Binding] = None

      for item in items:
        match item:
          case ast.Starred(ctx=ast.Load(), value=item_value) if not starred:
            starred = parse_binding_expr(item_value, envs=envs, source=source, write_env=write_env)
          case _:
            binding = parse_binding_expr(item, envs=envs, source=source, write_env=write_env)

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

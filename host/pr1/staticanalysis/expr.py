import ast
import binascii
import functools
import math
import os
from dataclasses import KW_ONLY, dataclass, field
from types import CodeType
from typing import Any, Callable, Generic, Optional, Self, Sequence, TypeVar
from unicodedata import name

from .types import ClassDefWithTypeArgs, TypeInstance


def generate_name():
  return "_" + binascii.b2a_hex(os.urandom(4)).decode()


T = TypeVar('T')

@dataclass
class Container(Generic[T]):
  value: T


@dataclass(kw_only=True)
class InstanceExpr:
  dependencies: set[str] = field(default_factory=set)
  phase: int
  type: ClassDefWithTypeArgs

@dataclass
class Expr:
  node: ast.expr
  type: TypeInstance
  _: KW_ONLY
  components: dict[str, Self] = field(default_factory=dict)
  dependencies: set[str] = field(default_factory=set)
  frequency: float = math.inf
  phase: int = 0

  @functools.cached_property
  def code(self):
    return compile(ast.Expression(self.node), "<string>", mode='eval')

  def to_evaluated(self):
    return UnevaluatedExpr(
      components={ name: component.to_evaluated() for name, component in self.components.items() },
      expr=self
    )

  @classmethod
  def assemble(cls, type: TypeInstance, exprs: Sequence[Self], get_node: Callable[[list[ast.expr]], ast.expr]):
    max_phase = max([expr.phase for expr in exprs])

    # [a * index for index in range(phase0var)]
    # [a * index for index in range(phase1var)]

    components = dict[str, Expr]()
    items = list[ast.expr]()

    for expr in exprs:
      if expr.phase < max_phase:
        name = generate_name()
        components[name] = expr
        items.append(transfer_node_location(expr.node, ast.Name(name, ctx=ast.Load())))
      else:
        components |= expr.components
        items.append(expr.node)

    # print(items, preevaluated)

    return cls(
      components=components,
      dependencies=set.union(*[expr.dependencies for expr in exprs]),
      frequency=min([expr.frequency for expr in exprs]),
      node=get_node(items),
      phase=max_phase,
      type=type
    )

@dataclass
class EvaluatedExpr:
  value: Any

@dataclass(frozen=True)
class UnevaluatedExpr:
  components: dict[str, EvaluatedExpr | Self]
  expr: Expr

  def evaluate(self, phase: int, variables: dict[str, Any]):
    evaluated_components = {
      name: component.evaluate(phase, variables) if isinstance(component, UnevaluatedExpr) else component
      for name, component in self.components.items()
    }

    if self.expr.phase <= phase:
      all_variables = variables | { name: component.value for name, component in evaluated_components.items() }
      return EvaluatedExpr(eval(self.expr.code, globals(), all_variables))
    else:
      return UnevaluatedExpr(
        components=evaluated_components,
        expr=self.expr
      )


T_AST = TypeVar('T_AST', bound=ast.AST)

def transfer_node_location(source: T_AST, target: T_AST) -> T_AST:
  target.lineno = source.lineno
  target.col_offset = source.col_offset
  target.end_lineno = source.end_lineno
  target.end_col_offset = source.end_col_offset

  return target

from abc import ABC, abstractmethod
import ast
import binascii
import functools
import math
import os
from dataclasses import KW_ONLY, dataclass, field
from typing import Any, Callable, ClassVar, Generic, Optional, Protocol, Self, Sequence, TypeVar

from .types import ClassDefWithTypeArgs, TypeInstance


def generate_name():
  return "_" + binascii.b2a_hex(os.urandom(4)).decode()


T = TypeVar('T')

@dataclass
class Container(Generic[T]):
  value: T


# Phase 1

@dataclass
class BaseRegularExpr(ABC):
  node: ast.expr
  phase: int
  _: KW_ONLY
  type: TypeInstance

  @abstractmethod
  def to_evaluated(self) -> 'BaseEvaluationExpr':
    ...

@dataclass
class Expr(BaseRegularExpr):
  components: dict[str, BaseRegularExpr] = field(default_factory=dict)

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

    components = dict[str, BaseRegularExpr]()
    items = list[ast.expr]()

    for expr in exprs:
      if expr.phase < max_phase:
        name = generate_name()
        components[name] = expr
        items.append(transfer_node_location(expr.node, ast.Name(name, ctx=ast.Load())))
      else:
        if isinstance(expr, Expr):
          components |= expr.components

        items.append(expr.node)

    # print(items, preevaluated)

    return cls(
      components=components,
      node=get_node(items),
      phase=max_phase,
      type=type
    )

@dataclass
class UnknownExprDef:
  EvaluationExpr: 'type[BaseEvaluationExpr]'
  type: TypeInstance

  def to_evaluated(self):
    return self.EvaluationExpr()

@dataclass
class UnknownExpr(BaseRegularExpr):
  expr_def: UnknownExprDef

  def to_evaluated(self):
    return VariableExpr(self.expr_def)


# Phase 2

class BaseEvaluationExpr(ABC):
  pass

@dataclass
class EvaluatedExpr(BaseEvaluationExpr):
  value: Any

@dataclass(frozen=True)
class UnevaluatedExpr(BaseEvaluationExpr):
  components: dict[str, BaseEvaluationExpr]
  expr: Expr

  def evaluate(self, variables: dict[str, Any]):
    evaluated_components = {
      name: component.evaluate(variables) if isinstance(component, UnevaluatedExpr) else component
      for name, component in self.components.items()
    }

    if all(isinstance(component, EvaluatedExpr) for component in evaluated_components.values()):
      all_variables = variables | { name: component.value for name, component in evaluated_components.items() }
      return EvaluatedExpr(eval(self.expr.code, globals(), all_variables))
    else:
      return UnevaluatedExpr(
        components=evaluated_components,
        expr=self.expr
      )

  def to_watched(self):
    return WatchedExpr(
      components={ name: component.to_watched() if isinstance(component, UnevaluatedExpr) else component for name, component in self.components.items() },
      expr=self.expr
    )

@dataclass(frozen=True)
class DeferredExpr(BaseEvaluationExpr):
  name: str
  phase: int

  def evaluate(self, variables: dict[str, Any]):
    return EvaluatedExpr(variables[self.name]) if (self.phase < 1) else self.__class__(self.name, self.phase - 1)

@dataclass
class VariableExpr(BaseEvaluationExpr):
  expr_def: UnknownExprDef

  def evaluate(self, variables: dict[str, Any]):
    return self


# Phase 3

class BaseWatchedExpr(ABC):
  initialized: ClassVar[bool]
  value: ClassVar[Any]

  @abstractmethod
  def watch(self, listener: Callable[[Self], None], /):
    ...

@dataclass
class WatchedExpr(BaseWatchedExpr):
  components: dict[str, BaseWatchedExpr | EvaluatedExpr]
  expr: Expr
  initialized: bool = False
  value: Optional[Any] = None
  _listeners: set[Callable[[Self], None]] = field(default_factory=set, init=False)

  def watch(self, listener, /):
    self._listeners.add(listener)

    def change(watchable: BaseWatchedExpr):
      if all(isinstance(component, EvaluatedExpr) or component.initialized for component in self.components.values()):
        self.initialized = True
        self.value = eval(self.expr.code, globals(), { name: component.value for name, component in self.components.items() })

        for listener in self._listeners:
          listener(self)

    for component in self.components.values():
      if not isinstance(component, EvaluatedExpr):
        component.watch(change)


T_AST = TypeVar('T_AST', bound=ast.AST)

def transfer_node_location(source: T_AST, target: T_AST) -> T_AST:
  target.lineno = source.lineno
  target.col_offset = source.col_offset
  target.end_lineno = source.end_lineno
  target.end_col_offset = source.end_col_offset

  return target


# frequency[time(), 3 * ureg.Hz]
# static[dev.Oko.temperature]

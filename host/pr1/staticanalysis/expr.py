from abc import ABC, abstractmethod
import ast
import binascii
import functools
import math
import os
from dataclasses import KW_ONLY, dataclass, field
from typing import Any, Callable, ClassVar, Generic, Optional, Protocol, Self, Sequence, TypeVar

from .types import TypeInstance


@dataclass
class ComplexVariable:
  ExprEvalType: 'Callable[[int], BaseExprEval]'
  type: TypeInstance


# Phase 1

@dataclass(frozen=True)
class BaseExprDef(ABC):
  node: ast.expr
  type: TypeInstance
  _: KW_ONLY
  phase: int = 0

  @abstractmethod
  def to_evaluated(self) -> 'BaseExprEval':
    ...

@dataclass(frozen=True)
class CompositeExprDef(BaseExprDef):
  components: dict[str, BaseExprDef] = field(default_factory=dict)

  @functools.cached_property
  def code(self):
    return compile(ast.Expression(self.node), "<string>", mode='eval')

  def to_evaluated(self):
    return CompositeExprEval(
      components={ name: component.to_evaluated() for name, component in self.components.items() },
      expr=self
    )

  @classmethod
  def assemble(cls, type: TypeInstance, exprs: Sequence[BaseExprDef], get_node: Callable[[list[ast.expr]], ast.expr]):
    max_phase = max([expr.phase for expr in exprs])

    components = dict[str, BaseExprDef]()
    items = list[ast.expr]()

    for expr in exprs:
      # TODO: Check and improve
      if expr.phase > 0:
        name = generate_name()
        components[name] = expr
        items.append(transfer_node_location(expr.node, ast.Name(name, ctx=ast.Load())))
      else:
        if isinstance(expr, CompositeExprDef):
          components |= expr.components

        items.append(expr.node)

    return cls(
      components=components,
      node=get_node(items),
      phase=0,
      type=type
    )

@dataclass(frozen=True)
class ComplexExprDef(BaseExprDef):
  ExprEvalType: 'Callable[[int], BaseExprEval]'
  symbol: int

  def to_evaluated(self):
    return self.ExprEvalType(self.symbol)


# Phase 2

@dataclass
class EvaluationError(Exception):
  cause: Exception

class BaseExprEval(ABC):
  @abstractmethod
  def evaluate(self, stack: dict[int, Any]) -> Self:
    ...

  def to_watched(self) -> 'BaseExprWatch':
    raise NotImplementedError

@dataclass(frozen=True)
class ConstantExprEval(BaseExprEval):
  value: Any

  def evaluate(self, stack):
    return self

  def to_watched(self):
    return ConstantExprWatch(self.value)

@dataclass(frozen=True)
class CompositeExprEval(BaseExprEval):
  components: dict[str, BaseExprEval]
  expr: CompositeExprDef

  def evaluate(self, stack):
    evaluated_components = {
      name: component.evaluate(stack)
      for name, component in self.components.items()
    }

    if all(isinstance(component, ConstantExprEval) for component in evaluated_components.values()):
      all_variables = {
        name: component.value for name, component in evaluated_components.items() # type: ignore
      }

      try:
        result = eval(self.expr.code, dict(), all_variables)
      except Exception as e:
        raise EvaluationError(e) from e
      else:
        return ConstantExprEval(result)
    else:
      return CompositeExprEval(
        components=evaluated_components,
        expr=self.expr
      )

  def to_watched(self):
    return CompositeExprWatch(
      components={ name: component.to_watched() for name, component in self.components.items() },
      expr=self.expr
    )

@dataclass(frozen=True)
class DeferredExprEval(BaseExprEval):
  name: str
  phase: int
  symbol: int

  def evaluate(self, stack):
    return ConstantExprEval(stack[self.symbol][self.name]) if (self.phase < 1) else self.__class__(self.name, self.phase - 1, self.symbol)

  @classmethod
  def create(cls, name: str, phase: int):
    return KnownDeferredExprEval(name, phase)

@dataclass(frozen=True)
class KnownDeferredExprEval:
  name: str
  phase: int

  def __call__(self, symbol: int):
    return DeferredExprEval(self.name, self.phase, symbol)


# Phase 3

class Dependency:
  pass

@dataclass
class BaseExprWatch(ABC):
  dependencies: ClassVar[set[Dependency]]

  @abstractmethod
  def evaluate(self, changed_dependencies: set[Dependency]) -> Any:
    ...

@dataclass(kw_only=True)
class CompositeExprWatch(BaseExprWatch):
  components: dict[str, BaseExprWatch]
  initialized: bool = False
  expr: CompositeExprDef
  value: Optional[Any] = None

  @property
  def dependencies(self):
    dependencies = set[Dependency]()

    for component in self.components.values():
      dependencies |= component.dependencies

    return dependencies

  def evaluate(self, changed_dependencies: set[Dependency]):
    if (changed_dependencies & self.dependencies) or (not self.initialized):
      self.initialized = True
      self.value = eval(self.expr.code, globals(), { name: component.evaluate(changed_dependencies) for name, component in self.components.items() })

    return self.value

@dataclass
class ConstantExprWatch:
  dependencies: set[Dependency] = field(default_factory=set, init=False)
  value: Any

  def evaluate(self, changed_dependencies):
    return self.value


# Utilities

T_AST = TypeVar('T_AST', bound=ast.AST)

def transfer_node_location(source: T_AST, target: T_AST) -> T_AST:
  target.lineno = source.lineno
  target.col_offset = source.col_offset
  target.end_lineno = source.end_lineno
  target.end_col_offset = source.end_col_offset

  return target


def generate_name():
  return "_" + binascii.b2a_hex(os.urandom(4)).decode()


T = TypeVar('T')

@dataclass
class Container(Generic[T]):
  value: T

# frequency[time(), 3 * ureg.Hz]
# static[dev.Oko.temperature]


__all__ = [
  'BaseExprDef',
  'BaseExprEval',
  'BaseExprWatch',
  'ComplexExprDef',
  'ComplexVariable',
  'CompositeExprDef',
  'CompositeExprEval',
  'CompositeExprWatch',
  'ConstantExprEval',
  'ConstantExprWatch',
  'Container',
  'DeferredExprEval',
  'Dependency',
  'KnownDeferredExprEval'
]

import ast
import binascii
import functools
import math
import os
from dataclasses import dataclass, field
from types import CodeType
from typing import Any, Generic, Optional, Self, TypeVar

from .types import ClassDefWithTypeArgs


def generate_name():
  return "_v" + binascii.b2a_hex(os.urandom(4)).decode()


T = TypeVar('T')

@dataclass
class Container(Generic[T]):
  value: T


@dataclass(kw_only=True)
class InstanceExpr:
  dependencies: set[str] = field(default_factory=set)
  phase: int
  type: ClassDefWithTypeArgs

@dataclass(kw_only=True)
class Expr:
  components: dict[str, Self] = field(default_factory=dict)
  dependencies: set[str] = field(default_factory=set)
  frequency: float = math.inf
  node: ast.expr
  phase: int
  type: ClassDefWithTypeArgs
  value: Optional[Container[Any]] = None

  @functools.cached_property
  def code(self):
    return compile(ast.Expression(self.node), "<string>", mode='eval')

  def evaluate(self, phase: int, variables: dict[str, Any]):
    if self.value:
      return self.value.value

    all_variables = variables.copy()

    for component_name, component in self.components.items():
      all_variables[component_name] = component.evaluate(phase, variables)

    if self.phase <= phase:
      self.value = Container(eval(self.code, globals(), all_variables))
      return self.value.value

    return None


def transfer_node_location(source: ast.AST, target: ast.AST):
  target.lineno = source.lineno
  target.col_offset = source.col_offset
  target.end_lineno = source.end_lineno
  target.end_col_offset = source.end_col_offset

  return target

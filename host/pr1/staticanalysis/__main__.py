import ast
import asyncio
from dataclasses import dataclass
from pprint import pprint
import sys
import time
from typing import Any, Optional

from ..document import Document
from ..error import DiagnosticDocumentReference
from .context import StaticAnalysisContext
from .expr import BaseExprEval, BaseExprWatch, ComplexVariable, DeferredExprEval, Dependency
from .expression import evaluate_eval_expr
from .support import create_prelude, process_source
from .types import ClassDef, ClassDefWithTypeArgs


prelude = create_prelude()

type_defs, type_instances = process_source("""
# X = list[int]

# T = TypeVar('T')

# class A(Generic[T]):
#   def x(self) -> T:
#     ...

# scalar: float | int
# scalar: int

# int_list = list[int, float]
# A = int | float
# A = list[int]

# x: list[int]
# x: int
# y: x
# y: type[x]
# x: list[T]
""", prelude)

# pprint(type_defs)
# pprint(type_instances)

@dataclass
class RandomDependency(Dependency):
  value: Optional[float] = None

  def __hash__(self):
    return id(self)

  async def watch(self):
    while True:
      self.value = time.time()
      yield

      await asyncio.sleep(0.05)

@dataclass
class RandomExprEval(BaseExprEval):
  def evaluate(self, variables):
    return self

  def to_watched(self):
    return RandomExprWatch()

@dataclass
class RandomExprWatch(BaseExprWatch):
  dependencies = {RandomDependency()}
  initialized: bool = False
  value: Optional[float] = None

  def evaluate(self, changed_dependencies):
    return next(iter(self.dependencies)).value


foreign_exprs = {
  'A': ComplexVariable(
    ExprEvalType=(lambda: DeferredExprEval(name='A', phase=0)),
    type=ClassDefWithTypeArgs(ClassDef("A"))
  ),
  'B': ComplexVariable(
    ExprEvalType=(lambda: DeferredExprEval(name='B', phase=1)),
    type=ClassDefWithTypeArgs(ClassDef("B"))
  ),
  'C': ComplexVariable(
    ExprEvalType=(lambda: RandomExprEval()),
    type=ClassDefWithTypeArgs(ClassDef("C"))
  )

  # 'dev': InstanceExpr(
  #   phase=1,
  #   type=ClassDefWithTypeArgs(ClassDef("Devices", instance_attrs={
  #     'foo': ClassDefWithTypeArgs(ClassDef("Foo"))
  #   }))
  # )
}



document = Document.text("~~~ [C - B, C - B] ~~~")
context = StaticAnalysisContext(
  input_value=document.source[4:-4]
)

root = ast.parse(context.input_value, mode='eval')

# print(ast.dump(root, indent=2))
analysis, result = evaluate_eval_expr(root.body, (type_defs, foreign_exprs), prelude, context)

print()
print('---')
print()

for error in analysis.errors:
  print("Error :", error)

  for reference in error.references:
    if isinstance(reference, DiagnosticDocumentReference) and reference.area:
      print(reference.area.format())

# pprint(result)
# print(ast.dump(result.node, indent=2))

# print()
# pprint(analysis)

# pprint(result.to_evaluated())


phA = result.to_evaluated()

# print(ast.dump(phA.expr.node, indent=2))
# pprint(phA)
# sys.exit()

# print("\n---\n")

ph0 = phA.evaluate(variables={ 'A': 42 })

# pprint(ph0)
# sys.exit()

ph1 = ph0.evaluate(variables={
  'B': time.time()
})

# print()
# print()
# pprint(ph1)
# sys.exit()

# print(ast.dump(ph1.expr.node, indent=2))


w = ph1.to_watched()

# pprint(w)


async def main():
  dep = next(iter(w.dependencies))
  it = dep.watch()

  async for _ in it:
    print(w.evaluate({dep}))

  # await asyncio.sleep(10)


asyncio.run(main())


# y = x.evaluate(phase=1, variables={
#   'B': 'b'
# })

# print(y)


# def hyst(expr, duration):
#   expr()
#   pass


# class hyst:
#   def __init__(self, expr, duration):
#     self.duration = duration
#     self.expr = expr

#   def change(self, dependencies):
#     value = self.expr(dependencies)

#     if value:
#       self.handle = self.pool.start_soon(self._run())
#     elif self.handle:
#       self.handle.cancel()
#       self.handle = None

#     self.ret(True)

#   def _run(self):
#     self.ret(False)


# def hyst(expr, duration, *, _context):
#   handle = None

#   def change(value):
#     nonlocal handle

#     if value and (not handle):
#       handle = _context.pool.start_soon(run())
#     elif (not value) and handle:
#       handle.cancel()
#       handle = None

#     _context.trigger(False)

#   async def run():
#     nonlocal handle

#     await _context.sleep(duration)
#     _context.trigger(True)
#     handle = None

#   expr.listen(change)

import ast
import asyncio
from dataclasses import dataclass
from pprint import pprint
import sys
import time
from typing import Any, Optional

from ..util.asyncio import Cancelable

from ..document import Document
from ..error import ErrorDocumentReference
from .context import StaticAnalysisContext
from .expr import BaseEvaluationExpr, BaseWatchedExpr, UnknownExpr, UnknownExprDef
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
class RandomEvaluationExpr(BaseEvaluationExpr):
  pass

@dataclass
class RandomWatchedExpr(BaseWatchedExpr):
  initialized: bool = False
  value: Optional[float] = None

  def watch(self, listener):
    async def fn():
      while True:
        self.initialized = True
        self.value = time.time()

        listener(self)
        await asyncio.sleep(1)

    task = asyncio.create_task(fn())

    def cancel():
      task.cancel()

    return Cancelable(cancel)


foreign_exprs = {
  'A': UnknownExprDef(
    RandomEvaluationExpr,
    type=ClassDefWithTypeArgs(ClassDef("A"))
  ),
  # 'B': InstanceExpr(
  #   type=ClassDefWithTypeArgs(ClassDef("B"))
  # )

  # 'B': InstanceExpr(
  #   dependencies={'B'},
  #   phase=100,
  #   type=ClassDefWithTypeArgs(ClassDef("B"))
  # ),
  # 'C': InstanceExpr(
  #   dependencies={'C'},
  #   phase=2,
  #   type=ClassDefWithTypeArgs(ClassDef("C"))
  # ),
  # 'dev': InstanceExpr(
  #   phase=1,
  #   type=ClassDefWithTypeArgs(ClassDef("Devices", instance_attrs={
  #     'foo': ClassDefWithTypeArgs(ClassDef("Foo"))
  #   }))
  # )
}



# document = Document.text("~~~ [A, B, [A, C], [A, B], (6).__add__, (3).__add__(A + A)] ~~~")
document = Document.text("~~~ A ~~~")
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
    if isinstance(reference, ErrorDocumentReference) and reference.area:
      print(reference.area.format())

# pprint(result)
# print(ast.dump(result.node, indent=2))

# print()
# pprint(analysis)

# pprint(result.to_evaluated())


phA = result.to_evaluated()

pprint(phA)
sys.exit()

ph0 = phA.evaluate(variables={})

pprint(ph0)
sys.exit()

ph1 = ph0.evaluate(variables={
  'A': 'a',
  'B': 'b',
  'C': 'c'
})

print()
print()
# pprint(ph1)
# print(ast.dump(ph1.expr.node, indent=2))


w = ph1.to_watched()

# def listener(x):
#   print(">", x)

# w.watch(listener)


pprint(w)


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


# expr: Any = (...)

# def run(dep):
#   expr({dep})

# for dep in expr.dependencies:
#   dep.watch(run)


# class Clock:
#   def __init__(self):
#     self.delay = 1
#     self._listeners = set()

#   def interpolate(self):
#     ...

#   def listen(self, listener):
#     self._listeners.add(listener)

#   async def start(self):
#     while True:
#       await asyncio.sleep(1)

#       current_time = time.time()

#       for listener in self._listeners:
#         listener(self, current_time, current_time)

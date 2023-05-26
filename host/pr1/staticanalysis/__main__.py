import ast
from pprint import pprint

from ..document import Document
from ..error import ErrorDocumentReference
from .context import StaticAnalysisContext
from .expr import Expr, InstanceExpr
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


foreign_instances = {
  'A': InstanceExpr(
    dependencies={'A'},
    phase=0,
    type=ClassDefWithTypeArgs(ClassDef("A"))
  ),
  'B': InstanceExpr(
    dependencies={'B'},
    phase=1,
    type=ClassDefWithTypeArgs(ClassDef("B"))
  ),
  'C': InstanceExpr(
    dependencies={'C'},
    phase=0,
    type=ClassDefWithTypeArgs(ClassDef("C"))
  )
}


# import sys
# sys.exit()



document = Document.text("~~~ [A, B, [A, C], [A, B]] ~~~")
context = StaticAnalysisContext(
  input_value=document.source[4:-4]
)

root = ast.parse(context.input_value, mode='eval')

# print(ast.dump(root, indent=2))
analysis, result = evaluate_eval_expr(root.body, (type_defs, foreign_instances), prelude, context)

print()
print('---')
print()

for error in analysis.errors:
  print("Error :", error)

  for reference in error.references:
    if isinstance(reference, ErrorDocumentReference) and reference.area:
      print(reference.area.format())

pprint(result)
print(ast.dump(result.node, indent=2))

# print()
# pprint(analysis)


# def evaluate_expr(expr: Expr, /):
#   pass

result.evaluate(phase=0, variables={
  'A': 'a',
  'C': 'c'
})

print()
print()
pprint(result)

x = result.evaluate(phase=1, variables={
  'B': 'b'
})

print(x)

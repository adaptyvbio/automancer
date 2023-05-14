import ast
from pprint import pprint

from ..document import Document
from ..error import ErrorDocumentReference
from .context import StaticAnalysisContext
from .expression import evaluate_eval_expr
from .special import CoreVariables
from .support import process_source


x = process_source("""
T = TypeVar('T')
S = T

class int:
  pass

class float:
  pass

class list(Generic[T]):
  sample: T

# x: list[int]

# x: int
# y: x
# y: type[x]
# x: list[T]
""", CoreVariables)

pprint(x)


import sys
sys.exit()


document = Document.text("~~~ x ~~~")
context = StaticAnalysisContext(
  input_value=document.source[4:-4],
  prelude={}
)

root = ast.parse(context.input_value, mode='eval')

# print(ast.dump(root, indent=2))
analysis, result = evaluate_eval_expr(root.body, x, set(), context)

for error in analysis.errors:
  print("Error :", error)

  for reference in error.references:
    if isinstance(reference, ErrorDocumentReference) and reference.area:
      print(reference.area.format())

print('---')
pprint(result)

print()
pprint(analysis)

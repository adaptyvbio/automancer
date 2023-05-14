import ast
from pprint import pprint

from ..document import Document
from ..error import ErrorDocumentReference
from .context import StaticAnalysisContext
from .expression import evaluate_type
from .special import CoreVariables
from .support import process_source


x = process_source("""
T = TypeVar('T')

class int:
  pass

class list(Generic[T]):
  sample: T

# x: list[T]
x: list[list[int]]
# x: int
# y: x
# y: type[x]
# x: list[T]
""", CoreVariables)

pprint(x)



document = Document.text("~~~ [3, 4] ~~~")
context = StaticAnalysisContext(
  input_value=document.source[4:-4],
  prelude={}
)

root = ast.parse(context.input_value, mode='eval')

# print(ast.dump(root, indent=2))
analysis, result = evaluate_type(root.body, x, set(), context)

for error in analysis.errors:
  print("Error :", error)
  for reference in error.references:
    if isinstance(reference, ErrorDocumentReference) and reference.area:
      print(reference.area.format())

print('---')
pprint(result)

print()
pprint(analysis)

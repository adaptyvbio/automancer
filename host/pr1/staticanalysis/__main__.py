import ast
from pprint import pprint

from ..document import Document
from ..error import ErrorDocumentReference
from .context import StaticAnalysisContext
from .expression import evaluate_eval_expr
from .special import CoreTypeDefs
from .support import process_source


type_defs, variables = process_source("""
T = TypeVar('T')
S = T

class int:
  pass

class float:
  pass

class set(Generic[T]):
  self.item: T | float

class list(Generic[T]):
  self.sample: T
  self.samples: set[T]

  def append(self, item: T, /) -> T:
    pass


X = list[int]

# int_list = list[int, float]
# A = int | float
# A = list[int]

# x: list[int]
# x: int
# y: x
# y: type[x]
# x: list[T]
""")

pprint(type_defs)
pprint(variables)


# import sys
# sys.exit()


print()
print('---')
print()


# document = Document.text("~~~ list[float]().samples.item ~~~")
document = Document.text("~~~ X().append(int()) ~~~")
context = StaticAnalysisContext(
  input_value=document.source[4:-4],
  prelude={}
)

root = ast.parse(context.input_value, mode='eval')

# print(ast.dump(root, indent=2))
analysis, result = evaluate_eval_expr(root.body, type_defs, variables, context)

for error in analysis.errors:
  print("Error :", error)

  for reference in error.references:
    if isinstance(reference, ErrorDocumentReference) and reference.area:
      print(reference.area.format())

pprint(result)

print()
pprint(analysis)

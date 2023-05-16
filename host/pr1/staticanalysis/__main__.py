import ast
from pprint import pprint
import sys

from ..document import Document
from ..error import ErrorDocumentReference
from .context import StaticAnalysisContext
from .expression import evaluate_eval_expr
from .special import CoreTypeDefs
from .support import create_prelude, process_source


prelude = create_prelude()

type_defs, type_instances = process_source("""
X = list[int]

# int_list = list[int, float]
# A = int | float
# A = list[int]

# x: list[int]
# x: int
# y: x
# y: type[x]
# x: list[T]
""", prelude)

pprint(type_defs)
pprint(type_instances)


# import sys
# sys.exit()


print()
print('---')
print()


# document = Document.text("~~~ X().append(34) ~~~")
document = Document.text("~~~ [3, 4] ~~~")
context = StaticAnalysisContext(
  input_value=document.source[4:-4],
  prelude=prelude
)

root = ast.parse(context.input_value, mode='eval')

# print(ast.dump(root, indent=2))
analysis, result = evaluate_eval_expr(root.body, (prelude[0] | type_defs), (prelude[1] | type_instances), context)

for error in analysis.errors:
  print("Error :", error)

  for reference in error.references:
    if isinstance(reference, ErrorDocumentReference) and reference.area:
      print(reference.area.format())

pprint(result)

print()
pprint(analysis)

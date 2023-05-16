import ast

from .types import Symbols, TypeDefs, TypeInstances
from .special import CoreTypeDefs
from ..error import ErrorDocumentReference
from .module import evaluate_library_module
from ..document import Document
from .context import StaticAnalysisContext


# def process_source(contents: str, /, variables: Variables):
def process_source(contents: str, /, prelude: Symbols):
  module = ast.parse(contents)
  # print(ast.dump(module, indent=2))

  document = Document.text(contents)
  context = StaticAnalysisContext(
    input_value=document.source,
    prelude=prelude
  )

  analysis, result = evaluate_library_module(module, CoreTypeDefs | prelude[0], prelude[1], context)

  for error in analysis.errors:
    print("Error :", error)

    for reference in error.references:
      if isinstance(reference, ErrorDocumentReference) and reference.area:
        print(reference.area.format())

  return result


def create_prelude():
  type_defs, type_instances = process_source("""
class float:
  pass

class int:
  pass

class str:
  pass

T = TypeVar('T')

class list(Generic[T]):
  def append(self, item: T, /) -> None:
    ...

  def __getitem__(self, index: int, /) -> T:
    ...


def random() -> float:
  ...
""", (TypeDefs(), TypeInstances()))

  return (CoreTypeDefs | type_defs), type_instances

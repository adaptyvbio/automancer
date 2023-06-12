import ast

from .types import PreludeTypeDefs, PreludeTypeInstances, Symbols, TypeDefs, TypeInstances
from .special import CoreTypeDefs
from ..error import DiagnosticDocumentReference
from .module import evaluate_library_module
from ..document import Document
from .context import StaticAnalysisContext


# def process_source(contents: str, /, variables: Variables):
def process_source(contents: str, /, prelude: Symbols):
  module = ast.parse(contents)
  # print(ast.dump(module, indent=2))

  document = Document.text(contents)
  context = StaticAnalysisContext(
    input_value=document.source
  )

  analysis, result = evaluate_library_module(module, CoreTypeDefs | prelude[0], prelude[1], context)

  for error in analysis.errors:
    print("Error :", error)

    for reference in error.references:
      if isinstance(reference, DiagnosticDocumentReference) and reference.area:
        print(reference.area.format())

  return result


def create_prelude() -> tuple[PreludeTypeDefs, PreludeTypeInstances]:
  type_defs, type_instances = process_source("""
class float:
  def __add__(self, other: float, /) -> float:
    ...

  def __neg__(self) -> float:
    ...

class int:
  def __add__(self, other: int, /) -> int:
    ...

  def __mul__(self, other: int, /) -> int:
    ...

class bool:
  ...

class slice:
  pass

class str:
  def __add__(self, other: str, /) -> str:
    ...

  def __mul__(self, other: int, /) -> str:
    ...

  def __len__(self) -> int:
    ...

  def strip(self, chars: str = ...) -> str:
    ...

  def rstrip(self, chars: str = ...) -> str:
    ...

T = TypeVar('T')

class list(Generic[T]):
  def append(self, item: T, /) -> None:
    ...

  def __add__(self, other: list[T], /) -> list[T]:
    ...

  def __getitem__(self, index: int, /) -> T:
    ...

  def __getitem__(self, index: slice, /) -> list[T]:
    ...

  def __len__(self) -> int:
    ...


def random() -> float:
  ...
""", (TypeDefs(), TypeInstances()))

  return (CoreTypeDefs | type_defs), type_instances # type: ignore


prelude = create_prelude()


__all__ = [
  'prelude'
]

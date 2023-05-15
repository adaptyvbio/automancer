import ast

from .special import CoreTypeDefs, GenericClassDef, TypeVarClassDef
from ..error import ErrorDocumentReference
from .types import Variables
from .module import evaluate_library_module
from ..document import Document
from .context import StaticAnalysisContext


# def process_source(contents: str, /, variables: Variables):
def process_source(contents: str, /):
  module = ast.parse(contents)
  # print(ast.dump(module, indent=2))

  document = Document.text(contents)
  context = StaticAnalysisContext(
    input_value=document.source,
    prelude=Variables()
  )

  analysis, result_variables = evaluate_library_module(module, CoreTypeDefs, dict(), context)

  for error in analysis.errors:
    print("Error :", error)

    for reference in error.references:
      if isinstance(reference, ErrorDocumentReference) and reference.area:
        print(reference.area.format())

  return result_variables

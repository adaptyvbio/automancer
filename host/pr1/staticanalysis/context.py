import ast
from dataclasses import dataclass

from .types import Symbols
from ..analysis import DiagnosticAnalysis
from ..error import Diagnostic, ErrorDocumentReference
from ..reader import LocatedString


@dataclass(kw_only=True)
class StaticAnalysisContext:
  input_value: LocatedString
  prelude: Symbols

class StaticAnalysisDiagnostic(Diagnostic):
  def __init__(self, message: str, node: ast.expr | ast.stmt, context: StaticAnalysisContext, *, name: str = 'unknown'):
    super().__init__(
      message,
      name=('staticanalysis.' + name),
      references=[ErrorDocumentReference.from_area(context.input_value.compute_ast_node_area(node))]
    )

  def analysis(self, *, warning: bool = False):
    return StaticAnalysisAnalysis(warnings=[self]) if warning else StaticAnalysisAnalysis(errors=[self])


@dataclass(kw_only=True)
class StaticAnalysisAnalysis(DiagnosticAnalysis):
  pass

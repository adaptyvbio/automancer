import ast
from typing import Optional

from .context import StaticAnalysisAnalysis, StaticAnalysisContext
from .special import NoneType
from .type import evaluate_type_expr, instantiate_type
from .types import FuncArgDef, FuncKwArgDef, FuncOverloadDef, TypeDefs, TypeVariables


def parse_func(node: ast.FunctionDef, /, type_defs: TypeDefs, type_variables: TypeVariables, context: StaticAnalysisContext):
  analysis = StaticAnalysisAnalysis()

  def process_arg_type(annotation: Optional[ast.expr]):
    return annotation and instantiate_type(analysis.add(evaluate_type_expr(annotation, type_defs, type_variables, context)))

  args_pos = [FuncArgDef(
    name=arg.arg,
    type=process_arg_type(arg.annotation)
  ) for arg in node.args.posonlyargs]

  args_both = [FuncArgDef(
    name=arg.arg,
    type=process_arg_type(arg.annotation)
  ) for arg in node.args.args]

  args_kw = [FuncKwArgDef(
    has_default=(default is not None),
    name=arg.arg,
    type=process_arg_type(arg.annotation)
  ) for arg, default in zip(node.args.kwonlyargs, node.args.kw_defaults)]

  overload = FuncOverloadDef(
    args_posonly=args_pos,
    args_both=args_both,
    args_kwonly=args_kw,
    default_count=len(node.args.defaults),
    return_type=(instantiate_type(analysis.add(evaluate_type_expr(node.returns, type_defs, type_variables, context))) if node.returns else NoneType)
  )

  return analysis, overload

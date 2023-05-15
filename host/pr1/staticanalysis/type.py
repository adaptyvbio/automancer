import ast
from typing import Optional, cast

from .context import (StaticAnalysisAnalysis, StaticAnalysisContext,
                      StaticAnalysisDiagnostic)
from .special import TypeType, TypeVarClassDef
from .types import (ClassConstructorDef, ClassDef, ClassDefWithTypeArgs,
                    TypeDef, TypeDefs, TypeVarDef, TypeVariables, UnionDef,
                    UnknownDef)


def instantiate_type(input_type: TypeDef):
  match input_type:
    case ClassDef():
      return ClassDefWithTypeArgs(input_type, [UnknownDef()] * len(input_type.type_variables))
    case ClassDefWithTypeArgs() | TypeVarDef():
      return input_type
    case UnionDef(left, right):
      return UnionDef(instantiate_type(left), instantiate_type(right))
    case _:
      print("Unknown type", input_type)
      # raise Exception("Unknown type")
      return UnknownDef()

def evaluate_type_expr(
    node: ast.expr, /,
    variables: TypeDefs,
    type_variables: TypeVariables,
    context: StaticAnalysisContext,
) -> tuple[StaticAnalysisAnalysis, TypeDef]:
  match node:
    case ast.BinOp(left=left, op=ast.BitOr(), right=right):
      analysis = StaticAnalysisAnalysis()

      left_type = analysis.add(evaluate_type_expr(left, variables, type_variables, context))
      right_type = analysis.add(evaluate_type_expr(right, variables, type_variables, context))

      if isinstance(left_type, UnknownDef) or isinstance(right_type, UnknownDef):
        return analysis, UnknownDef()

      return analysis, UnionDef(left_type, right_type)

    case ast.Call(func, args, keywords):
      analysis, func_type = evaluate_type_expr(func, variables, type_variables, context)

      if isinstance(func_type, UnknownDef):
        return analysis, UnknownDef()

      if func_type is TypeVarClassDef:
        match args, keywords:
          case [ast.Constant(str(typevar_name))], []:
            return analysis, TypeVarDef(typevar_name)
          case _:
            return analysis + StaticAnalysisDiagnostic("Invalid TypeVar arguments", node, context).analysis(), UnknownDef()

      return analysis + StaticAnalysisDiagnostic("Invalid call", node, context).analysis(), UnknownDef()

    case ast.Name(id=name, ctx=ast.Load()):
      variable_type = variables.get(name)

      if not variable_type:
        return StaticAnalysisDiagnostic("Invalid reference to missing symbol", node, context, name='missing_symbol').analysis(), UnknownDef()

      return StaticAnalysisAnalysis(), variable_type

    case ast.Subscript(value=target, slice=subscript, ctx=ast.Load()):
      analysis = StaticAnalysisAnalysis()
      # subscript_value = variables[name]

      subscript_type = analysis.add(evaluate_type_expr(target, variables, type_variables, context))

      match subscript:
        case ast.Tuple(subscript_args, ctx=ast.Load()):
          expr_args = subscript_args
        case _:
          expr_args = [subscript]

      if isinstance(subscript_type, UnknownDef):
        return analysis, UnknownDef()

      if not isinstance(subscript_type, ClassDef):
        return analysis + StaticAnalysisDiagnostic("Invalid subscript operation", node, context, name='invalid_subscript').analysis(), UnknownDef()

      type_args = list[TypeDef]()

      for arg in expr_args:
        arg_type = analysis.add(evaluate_type_expr(arg, variables, type_variables, context))
        type_args.append(arg_type)

      if subscript_type is TypeType:
        if len(expr_args) != 1:
          return analysis + StaticAnalysisDiagnostic("Invalid type[...] arguments", node, context).analysis(), UnknownDef()

        return analysis, ClassConstructorDef(type_args[0])

      if len(type_args) != len(subscript_type.type_variables):
        return analysis + StaticAnalysisDiagnostic("Invalid type argument count", node, context).analysis(), UnknownDef()

      return analysis, ClassDefWithTypeArgs(subscript_type, [instantiate_type(type_arg) for type_arg in type_args])

    case _:
      raise Exception("Missing evaluate_type_expr()", ast.dump(node, indent=2))

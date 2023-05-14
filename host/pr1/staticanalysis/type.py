import ast
from typing import Optional, cast

from .overloads import find_overload
from .context import StaticAnalysisAnalysis, StaticAnalysisContext, StaticAnalysisDiagnostic
from .special import GenericClassDef, NoneType, TypeVarClassDef
from .types import AnyType, ClassDef, ClassDefWithTypeArgs, FuncDef, GenericClassDefWithGenerics, Instance, InstantiableClassDef, InstantiableType, TypeDef, TypeValues, TypeVarDef, TypeVariables, UnknownDef, UnknownType, Variables


def evaluate_type_expr(
    node: ast.expr, /,
    variables: dict[str, TypeDef],
    type_variables: TypeVariables,
    context: StaticAnalysisContext,
) -> tuple[StaticAnalysisAnalysis, TypeDef]:
  match node:
    case ast.BinOp(left=left, op=ast.BitOr(), right=right):
      analysis = StaticAnalysisAnalysis()

      left_type = analysis.add(evaluate_type_expr(left, variables, type_variables, context))
      right_type = analysis.add(evaluate_type_expr(right, variables, type_variables, context))

      if isinstance(left_type, UnknownType) or isinstance(right_type, UnknownType):
        return analysis, UnknownType()

      return analysis, UnionType(left_type, right_type)

    case ast.Name(id=name, ctx=ast.Load()):
      variable_type = variables.get(name)
      # print(">>>>>>>>", variable_type)

      if not variable_type:
        return StaticAnalysisDiagnostic("Invalid reference to missing symbol", node, context, name='missing_symbol').analysis(), UnknownType()

      # match variable_type:
      #   case ClassDef():
      #     return StaticAnalysisAnalysis(), Instance(InstantiableClassDef(variable_type, type_args=([UnknownType()] * len(variable_type.type_variables))))
      #   case InstantiableClassDef():
      #     return StaticAnalysisAnalysis(), Instance(variable_type)
      #   case _:
      #     return StaticAnalysisAnalysis(), variable_type

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

      # if subscript_type is GenericClassDef:
      #   type_vars = list[TypeVarDef]()

      #   for arg in expr_args:
      #     arg_value = analysis.add(evaluate_eval_expr(arg, variables, type_variables, context))

      #     assert isinstance(arg_value, TypeVarDef)
      #     type_vars.append(arg_value)

      #   return analysis, GenericClassDefWithGenerics(type_vars)

      if isinstance(subscript_type, UnknownDef):
        return analysis, UnknownDef()

      if not isinstance(subscript_type, ClassDef):
        return analysis + StaticAnalysisDiagnostic("Invalid subscript operation", node, context, name='invalid_subscript').analysis(), UnknownDef()

      # ref = cast(TypeClassRef[OuterType], type_ref.extract())
      # assert ref.arguments is None

      type_args = list[TypeDef]()

      for arg in expr_args:
        arg_type = analysis.add(evaluate_type_expr(arg, variables, type_variables, context))
        type_args.append(arg_type)

      return analysis, ClassDefWithTypeArgs(subscript_type, type_args)

    case _:
      raise Exception("Missing evaluate_type_expr()", ast.dump(node, indent=2))


def instantiate_type(input_type: AnyType, node: ast.expr, context: StaticAnalysisContext):
  match input_type:
    case Instance():
      return StaticAnalysisDiagnostic("Invalid type", node, context).analysis(), UnknownType()
    case UnionType(left, right):
      analysis = StaticAnalysisAnalysis()

      left_type = analysis.add(instantiate_type(left, node, context))
      right_type = analysis.add(instantiate_type(right, node, context))

      if isinstance(left_type, UnknownType) or isinstance(right_type, UnknownType):
        return analysis, UnknownType()

      return analysis, UnionType(left_type, right_type)
    case _:
      return StaticAnalysisAnalysis(), Instance(input_type)

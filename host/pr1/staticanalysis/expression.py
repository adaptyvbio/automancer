import ast
from typing import Any, overload

from .context import (StaticAnalysisAnalysis, StaticAnalysisContext,
                      StaticAnalysisDiagnostic)
from .overloads import find_overload
from .special import NoneType
from .type import evaluate_type_expr
from .types import (ClassConstructorDef, ClassDef, ClassDefWithTypeArgs,
                    FuncDef, PreludeTypeDefs, PreludeTypeInstances, Symbols, TypeDef, TypeDefs, TypeInstance, TypeInstances, TypeValues,
                    TypeVarDef, TypeVariables, UnionDef, UnknownDef)


def create_union(types: list[TypeDef], /) -> TypeDef:
  current_type: TypeDef = types[0]

  for type in types[1:]:
    current_type = UnionDef(current_type, type)

  return current_type


def instantiate_type_instance(input_type: ClassDef | ClassConstructorDef[ClassDefWithTypeArgs | ClassDef] | ClassDefWithTypeArgs | UnknownDef, /) -> ClassDefWithTypeArgs | UnknownDef:
  match input_type:
    case ClassDef():
      return ClassDefWithTypeArgs(input_type, [UnknownDef()] * len(input_type.type_variables))
    case ClassDefWithTypeArgs():
      return input_type
    # case ClassConstructorDef(cls, type_args):
    #   return ClassConstructorDef(
    #     instantiate_type_instance(cls)
    #   )
    # case UnionDef(left, right):
    #   return UnionDef(instantiate_type_instance(left), instantiate_type_instance(right))
    # case UnknownDef():
    #   return UnknownDef()
    case _:
      print("Unknown type instance", input_type)
      # raise Exception("Unknown type")
      return UnknownDef()


# @overload
# def resolve_type_variables(input_type: TypeDef, type_values: TypeValues) -> TypeDef:
#   ...

# @overload
# def resolve_type_variables(input_type: TypeDef, type_values: TypeValues) -> TypeDef:
#   ...

def resolve_type_variables(input_type: TypeDef, type_values: TypeValues) -> TypeInstance:
  match input_type:
    case ClassDefWithTypeArgs(cls, type_args):
      return ClassDefWithTypeArgs(cls, type_args=[
        resolve_type_variables(type_arg, type_values) for type_arg in type_args
      ])
    case TypeVarDef():
      return type_values[input_type] # type: ignore
    case UnknownDef():
      return UnknownDef()
    case UnionDef(left, right):
      return UnionDef(
        resolve_type_variables(left, type_values),
        resolve_type_variables(right, type_values)
      )
    case _:
      print(">>", input_type, type_values)
      raise Exception("Unknown type")


def evaluate_eval_expr(
    node: ast.expr, /,
    foreign_symbols: Symbols,
    prelude_symbols: tuple[PreludeTypeDefs, PreludeTypeInstances],
    context: StaticAnalysisContext
) -> tuple[StaticAnalysisAnalysis, TypeInstance]:
  foreign_type_defs, foreign_variables = foreign_symbols
  prelude_type_defs, prelude_variables = prelude_symbols

  match node:
    case ast.Attribute(obj, attr=attr_name, ctx=ast.Load()):
      analysis, obj_type = evaluate_eval_expr(obj, foreign_symbols, prelude_symbols, context)

      if isinstance(obj_type, UnknownDef):
        return analysis, UnknownDef()

      if not isinstance(obj_type, ClassDefWithTypeArgs):
        return analysis + StaticAnalysisDiagnostic("Invalid attribute target", obj, context).analysis(), UnknownDef()

      attr = obj_type.cls.instance_attrs.get(attr_name)

      if not attr:
        return analysis + StaticAnalysisDiagnostic("Invalid reference to missing attribute", node, context).analysis(), UnknownDef()

      if isinstance(attr, FuncDef):
        attr = ClassDefWithTypeArgs(attr, obj_type.type_args)

      return analysis, resolve_type_variables(attr, obj_type.type_values)

      # if obj_type.cls is UnknownDef:
      #   return analysis, ClassRef(UnknownDef)

      # if isinstance(obj_type, TypeClassRef):
      #   obj_type = cast(OuterType, obj_type.extract())
      # else:
      #   for class_ref in obj_type.mro():
      #     if attr := class_ref.cls.instance_attrs.get(attr_name):
      #       attr_type = attr.resolve(class_ref.arguments or dict())
      #       analysis += attr_type.analyze_access()
      #       return analysis, attr_type

      # for class_ref in obj_type.mro():
      #   if attr := class_ref.cls.class_attrs.get(attr_name):
      #     attr_type = attr.resolve(class_ref.arguments or dict())
      #     return analysis, attr_type

    case ast.Call(func, args, keywords):
      analysis, func_type = evaluate_eval_expr(func, foreign_symbols, prelude_symbols, context)

      args = analysis.add_sequence([evaluate_eval_expr(arg, foreign_symbols, prelude_symbols, context) for arg in args])
      kwargs = analysis.add_mapping({ keyword.arg: evaluate_eval_expr(keyword.value, foreign_symbols, prelude_symbols, context) for keyword in keywords if keyword.arg })

      if isinstance(func_type, UnknownDef):
        return analysis, UnknownDef()

      if isinstance(func_type, ClassConstructorDef):
        cls_with_type_args = instantiate_type_instance(func_type.target)

        if isinstance(cls_with_type_args, UnknownDef):
          return analysis, UnknownDef()

        init_func = cls_with_type_args.cls.instance_attrs['__init__']

        if not isinstance(init_func, FuncDef):
          return analysis + StaticAnalysisDiagnostic("Invalid constructor call", node, context).analysis(), UnknownDef()

        overload = find_overload(init_func, args=args, kwargs=kwargs, type_values=cls_with_type_args.type_values)

        if not overload:
          return analysis + StaticAnalysisDiagnostic("Invalid call", node, context).analysis(), UnknownDef()

        return analysis, cls_with_type_args
      else:
        assert isinstance(func_type, ClassDefWithTypeArgs) # To be removed

        func_ref = func_type.cls.instance_attrs.get('__call__')

        if not func_ref:
          return analysis + StaticAnalysisDiagnostic("Invalid object for call", node, context).analysis(), UnknownDef()

        assert isinstance(func_ref, FuncDef) # To be removed
        overload = find_overload(func_ref, args=args, kwargs=kwargs, type_values=func_type.type_values)

        if not overload:
          analysis.errors.append(StaticAnalysisDiagnostic("Invalid arguments", node, context))
          return analysis, UnknownDef()

        # return analysis, resolve_type_variables(instantiate_type_instance(overload.return_type), func_type.type_values)
        return analysis, instantiate_type_instance(resolve_type_variables(overload.return_type, func_type.type_values))
        # return analysis, resolve_type_variables(overload.return_type, func_type.type_values)

    case ast.Constant(None):
      return StaticAnalysisAnalysis(), instantiate_type_instance(NoneType)

    case ast.Constant(int()):
      return StaticAnalysisAnalysis(), instantiate_type_instance(prelude_type_defs['int'])

    case ast.List(elts):
      analysis, elts_types = StaticAnalysisAnalysis.sequence([evaluate_eval_expr(elt, foreign_symbols, prelude_symbols, context) for elt in elts])
      return analysis, ClassDefWithTypeArgs(prelude_type_defs['list'], type_args=[create_union(elts_types)])

    case ast.Name(id=name, ctx=ast.Load()):
      variable_value = foreign_variables.get(name)

      if not variable_value:
        return StaticAnalysisDiagnostic("Invalid reference to missing symbol", node, context, name='missing_symbol').analysis(), UnknownDef()

      return StaticAnalysisAnalysis(), variable_value

    case ast.Subscript(value=target, slice=subscript):
      analysis, target_type = evaluate_eval_expr(target, foreign_symbols, prelude_symbols, context)

      match subscript:
        case ast.Tuple(args, ctx=ast.Load()):
          subscript_items = args
        case _:
          subscript_items = [subscript]

      if isinstance(target_type, ClassConstructorDef):
        target_type = target_type.target

        if not isinstance(target_type, ClassDef):
          return StaticAnalysisDiagnostic("Invalid subscript target", target, context).analysis(), UnknownDef()

        type_args = analysis.add_sequence([evaluate_type_expr(item, foreign_type_defs, TypeVariables(), context) for item in subscript_items])

        if len(type_args) != len(target_type.type_variables):
          return analysis + StaticAnalysisDiagnostic("Invalid type argument count", node, context).analysis(), UnknownDef()

        return analysis, ClassConstructorDef(ClassDefWithTypeArgs(target_type, [instantiate_type_instance(type_arg) for type_arg in type_args]))

      raise Exception("Invalid subscript")

    case _:
      print("Missing evaluate_eval_expr()", ast.dump(node, indent=2))
      return StaticAnalysisAnalysis(), UnknownDef()

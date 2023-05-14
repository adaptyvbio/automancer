import ast
from typing import Optional, cast

from .context import (StaticAnalysisAnalysis, StaticAnalysisContext,
                      StaticAnalysisDiagnostic)
from .overloads import find_overload
from .special import GenericClassDef, NoneType, TypeVarClassDef
from .types import (AnyType, ClassDef, FuncDef, GenericClassDefWithGenerics,
                    Instance, InstantiableClassDef, InstantiableType,
                    TypeValues, TypeVarDef, TypeVariables, UnknownType,
                    Variables)


def accept_type_as_instantiable(input_type: InstantiableType, type_variables: Optional[TypeVariables] = None):
  # print(">>>>", input_type, type_variables)

  if isinstance(input_type, InstantiableClassDef):
    return StaticAnalysisAnalysis(), input_type
  elif isinstance(input_type, ClassDef):
    return StaticAnalysisAnalysis(), InstantiableClassDef(input_type, type_args=[])
  elif isinstance(input_type, TypeVarDef) and type_variables and (input_type in type_variables):
    return StaticAnalysisAnalysis(), input_type
  else:
    # return StaticAnalysisDiagnostic("Invalid type for instantiation")
    raise Exception(f"Invalid type {input_type!r}")


def resolve_type_variables(input_type: AnyType, type_values: TypeValues):
  # print(">>", input_type, type_values)

  match input_type:
    case TypeVarDef():
      return type_values[input_type]
    case Instance(origin):
      return Instance(cast(InstantiableClassDef, resolve_type_variables(origin, type_values)))
    case InstantiableClassDef():
      return InstantiableClassDef(input_type.cls, type_args=[
        resolve_type_variables(type_arg, type_values) for type_arg in input_type.type_args
      ])
    case _:
      raise Exception("Unkown type")


def evaluate_eval_expr(
    node: ast.expr, /,
    variables: Variables,
    type_variables: TypeVariables,
    context: StaticAnalysisContext
) -> tuple[StaticAnalysisAnalysis, AnyType]:
  match node:
    case ast.Attribute(obj, attr=attr_name, ctx=ast.Load()):
      analysis, obj_type = evaluate_type_expr(obj, variables, type_variables, context)

      if not isinstance(obj_type, Instance):
        return analysis + StaticAnalysisDiagnostic("Invalid attribute target", obj, context).analysis(), UnknownType()

      attr = obj_type.origin.cls.instance_attrs.get(attr_name)

      if not attr:
        return analysis + StaticAnalysisDiagnostic("Invalid reference to missing attribute", node, context).analysis(), UnknownType()

      return analysis, resolve_type_variables(attr, type_values=obj_type.origin.type_values)

      # if obj_type.cls is UnknownType:
      #   return analysis, ClassRef(UnknownType)

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

      return analysis + StaticAnalysisDiagnostic("Invalid reference to missing attribute", node, context).analysis(), ClassRef(UnknownType)


    case ast.Call(func, args, keywords):
      analysis, func_type = evaluate_eval_expr(func, variables, type_variables, context)

      if func_type is TypeVarClassDef:
        match args, keywords:
          case [ast.Constant(str(typevar_name))], []:
            return analysis, TypeVarDef(typevar_name)
          case _:
            raise Exception("Invalid TypeVar arguments")
      else:
        args = analysis.add_sequence([evaluate_eval_expr(arg, variables, type_variables, context) for arg in args])
        kwargs = analysis.add_mapping({ keyword.arg: evaluate_eval_expr(keyword.value, variables, type_variables, context) for keyword in keywords if keyword.arg })

        if func_type is UnknownType:
          return analysis, UnknownType()

        instantiable_type = analysis.add(accept_type_as_instantiable(func_type))
        assert isinstance(instantiable_type, InstantiableClassDef) # ?

        init_func = instantiable_type.cls.instance_attrs['__init__']
        assert isinstance(init_func, FuncDef)

        overload = find_overload(init_func, args=args, kwargs=kwargs)

        if not overload:
          analysis.errors.append(StaticAnalysisDiagnostic("Invalid call", node, context))

        return analysis, Instance(instantiable_type)

    case ast.Constant(None):
      return StaticAnalysisAnalysis(), NoneType

    case ast.Name(id=name, ctx=ast.Load()):
      variable_value = variables.get(name)

      if not variable_value:
        return StaticAnalysisDiagnostic("Invalid reference to missing symbol", node, context, name='missing_symbol').analysis(), UnknownType()

      return StaticAnalysisAnalysis(), variable_value

    case _:
      print("Missing evaluate_eval_expr()", ast.dump(node, indent=2))
      raise Exception

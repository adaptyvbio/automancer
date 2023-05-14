import ast
from typing import Optional, cast

from .overloads import find_overload
from .context import StaticAnalysisAnalysis, StaticAnalysisContext, StaticAnalysisDiagnostic
from .special import GenericClassDef, NoneType, TypeVarClassDef, UnknownType
from .types import AnyType, ClassDef, FuncDef, GenericClassDefWithGenerics, Instance, InstantiableClassDef, InstantiableType, TypeValues, TypeVarDef, TypeVariables, Variables


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
    print(">>>>", input_type)
    raise Exception("Invalid type")


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


def evaluate_type(
    node: ast.expr, /,
    variables: Variables,
    type_variables: TypeVariables,
    context: StaticAnalysisContext,
) -> tuple[StaticAnalysisAnalysis, AnyType]:
  match node:
    case ast.Attribute(obj, attr=attr_name, ctx=ast.Load()):
      analysis, obj_type = evaluate_type(obj, variables, type_variables, context)

      if not isinstance(obj_type, Instance):
        return analysis + StaticAnalysisDiagnostic("Invalid attribute target", obj, context).analysis(), UnknownType

      attr = obj_type.origin.cls.instance_attrs.get(attr_name)

      if not attr:
        return analysis + StaticAnalysisDiagnostic("Invalid reference to missing attribute", node, context).analysis(), UnknownType

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

    # case ast.BinOp(left=left, op=ast.BitOr(), right=right):
    #   analysis = StaticAnalysisAnalysis()

    #   left_type = analysis.add(evaluate_type(left, variables, context))
    #   right_type = analysis.add(evaluate_type(right, variables, context))

    #   return analysis, ClassRef(UnionType, arguments=[left_type, right_type])

    case ast.Call(func, args, keywords):
      analysis, func_type = evaluate_type(func, variables, type_variables, context)

      if func_type is TypeVarClassDef:
        match args, keywords:
          case [ast.Constant(str(typevar_name))], []:
            return analysis, TypeVarDef(typevar_name)
          case _:
            raise Exception("Invalid TypeVar arguments")
      else:
        args = analysis.add_sequence([evaluate_type(arg, variables, type_variables, context) for arg in args])
        kwargs = analysis.add_mapping({ keyword.arg: evaluate_type(keyword.value, variables, type_variables, context) for keyword in keywords if keyword.arg })

        if func_type is UnknownType:
          return analysis, UnknownType

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
        return StaticAnalysisDiagnostic("Invalid reference to missing symbol", node, context, name='missing_symbol').analysis(), UnknownType

      return StaticAnalysisAnalysis(), variable_value

    case ast.Subscript(value=target, slice=subscript, ctx=ast.Load()):
      analysis = StaticAnalysisAnalysis()
      # subscript_value = variables[name]

      subscript_type = analysis.add(evaluate_type(target, variables, type_variables, context))

      match subscript:
        case ast.Tuple(subscript_args, ctx=ast.Load()):
          expr_args = subscript_args
        case _:
          expr_args = [subscript]

      if subscript_type is GenericClassDef:
        type_vars = list[TypeVarDef]()

        for arg in expr_args:
          arg_value = analysis.add(evaluate_type(arg, variables, type_variables, context))

          assert isinstance(arg_value, TypeVarDef)
          type_vars.append(arg_value)

        return analysis, GenericClassDefWithGenerics(type_vars)


      if not isinstance(subscript_type, ClassDef):
        return analysis + StaticAnalysisDiagnostic("Invalid subscript operation", node, context, name='invalid_subscript').analysis(), UnknownType

      # ref = cast(TypeClassRef[OuterType], type_ref.extract())
      # assert ref.arguments is None

      type_args = list[InstantiableType]()

      for arg in expr_args:
        arg_raw_type = analysis.add(evaluate_type(arg, variables, type_variables, context))
        arg_type = analysis.add(accept_type_as_instantiable(arg_raw_type, type_variables))

        type_args.append(arg_type)

      # TODO: Handle union types

      # if ref.cls is GenericType:
      #   return analysis, TypeClassRef(
      #     GenericClassRef(ClassGenericsDef(
      #       before_tuple=cast(list[TypeVarDef], args)
      #     ))
      #   )

      # new_ref = ClassRef[InnerType](
      #   arguments={ typevar: arg for typevar, arg in zip(ref.cls.generics.before_tuple, cast(list[ClassRef], args)) },
      #   cls=ref.cls
      # )

      return analysis, InstantiableClassDef(subscript_type, type_args=type_args)

    case _:
      print("Missing", ast.dump(node, indent=2))
      raise Exception

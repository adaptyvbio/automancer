import ast
from re import S
from types import EllipsisType
from typing import Optional, cast

from .context import (StaticAnalysisAnalysis, StaticAnalysisContext,
                      StaticAnalysisDiagnostic)
from .function import parse_func
from .special import CoreTypeDefs, GenericClassDef, NoneType
from .type import evaluate_type_expr, instantiate_type
from .types import (ClassConstructorDef, ClassDef, ClassDefWithTypeArgs,
                    ExportedKnownTypeDef, ExportedTypeDefs, FuncDef, FuncOverloadDef,
                    Symbols, OrderedTypeVariables, TypeDefs,
                    TypeInstances, TypeVarDef, TypeVariables)


def evaluate_library_module(
  module: ast.Module,
  foreign_type_defs: TypeDefs,
  foreign_variables: TypeInstances,
  context: StaticAnalysisContext
) -> tuple[StaticAnalysisAnalysis, Symbols]:
  analysis = StaticAnalysisAnalysis()

  module_type_defs = TypeDefs()
  module_variables = TypeInstances()

  # print(ast.dump(module, indent=2))

  for module_statement in module.body:
    match module_statement:
      case ast.AnnAssign(target=ast.Name(id=variable_name), annotation=ann, value=None, simple=1):
        if (variable_name in module_type_defs) or (variable_name in module_variables):
          analysis.errors.append(StaticAnalysisDiagnostic("Duplicate variable declaration", module_statement.target, context))
          continue

        assert not (variable_name in module_variables)

        variable_type_def = analysis.add(evaluate_type_expr(ann, foreign_type_defs | module_type_defs, TypeVariables(), context))

        module_variables[variable_name] = instantiate_type(variable_type_def)

      case ast.Assign(
        targets=[ast.Name(id=name)],
        value=value
      ):
        assign_type = analysis.add(evaluate_type_expr(value, (foreign_type_defs | module_type_defs), TypeVariables(), context))

        module_type_defs[name] = assign_type

        if isinstance(assign_type, (ClassDef, ClassDefWithTypeArgs)):
          module_variables[name] = ClassConstructorDef(assign_type)

      case ast.ClassDef(name=class_name, bases=class_bases, body=class_body):
        cls = ClassDef(class_name)
        type_variables: Optional[OrderedTypeVariables] = None

        for class_base in class_bases:
          if isinstance(class_base, ast.Subscript):
            class_base_type = analysis.add(evaluate_type_expr(class_base.value, (foreign_type_defs | module_type_defs), TypeVariables(), context))

            if class_base_type is GenericClassDef:
              if type_variables is not None:
                analysis.errors.append(StaticAnalysisDiagnostic("Duplicate type variables definition", class_base, context))
                continue

              match class_base.slice:
                case ast.Tuple(subscript_args):
                  expr_args = subscript_args
                case _:
                  expr_args = [class_base.slice]

              potential_type_variables = analysis.add_sequence([evaluate_type_expr(arg, (foreign_type_defs | module_type_defs), None, context) for arg in expr_args])
              type_variables = OrderedTypeVariables()

              for potential_type_variable, type_variable_node in zip(potential_type_variables, expr_args):
                if not isinstance(potential_type_variable, TypeVarDef):
                  analysis.errors.append(StaticAnalysisDiagnostic("Invalid type variable", type_variable_node, context))
                elif potential_type_variable in type_variables:
                  analysis.errors.append(StaticAnalysisDiagnostic("Duplicate type variable", type_variable_node, context))
                else:
                  type_variables.append(potential_type_variable)

              continue

        cls.type_variables = type_variables or OrderedTypeVariables()
        unordered_type_variables = set(cls.type_variables)

        module_type_defs[class_name] = cls
        module_variables[class_name] = ClassConstructorDef(cls)

        init_func = FuncDef()
        cls.instance_attrs['__init__'] = init_func

        for class_statement in class_body:
          match class_statement:
            # foo: int
            case ast.AnnAssign(target=ast.Name(id=attr_name, ctx=ast.Store()), annotation=attr_ann, value=None, simple=1):
              if attr_name in cls.class_attrs:
                raise Exception("Duplicate class attribute")

              cls.class_attrs[attr_name] = instantiate_type(analysis.add(evaluate_type_expr(attr_ann, (foreign_type_defs | module_type_defs), None, context)))

            # self.foo: int
            case ast.AnnAssign(target=ast.Attribute(attr=attr_name, value=ast.Name(id='self')), annotation=attr_ann, simple=0):
              if attr_name in cls.instance_attrs:
                raise Exception("Duplicate instance attribute")

              cls.instance_attrs[attr_name] = instantiate_type(analysis.add(evaluate_type_expr(attr_ann, (foreign_type_defs | module_type_defs), unordered_type_variables, context)))

            case ast.FunctionDef(name=func_name):
              overload = analysis.add(parse_func(class_statement, (foreign_type_defs | module_type_defs), unordered_type_variables, context))
              assert (overload.args_posonly + overload.args_both)[0].name == 'self'

              if overload.args_posonly:
                overload.args_posonly = overload.args_posonly[1:]
              else:
                overload.args_both = overload.args_both[1:]

              if not (func_name in cls.instance_attrs):
                func = FuncDef(type_variables=cls.type_variables)
                cls.instance_attrs[func_name] = func
              else:
                assert isinstance(func := cls.instance_attrs[func_name], FuncDef)

              func.overloads.append(overload)

            case ast.Expr(ast.Constant(EllipsisType())) | ast.Pass():
              pass

            case _:
              print('Missing', ast.dump(class_statement, indent=2))
              analysis.errors.append(StaticAnalysisDiagnostic("Invalid operation", class_statement, context))

        if not init_func.overloads:
          init_func.overloads.append(FuncOverloadDef(
            args_both=list(),
            args_kwonly=list(),
            args_posonly=list(),
            default_count=0,
            return_type=NoneType
          ))

      case ast.FunctionDef(name=func_name):
        overload = analysis.add(parse_func(module_statement, (foreign_type_defs | module_type_defs), TypeVariables(), context))

        if func_name in module_type_defs:
          analysis.errors.append(StaticAnalysisDiagnostic("Duplicate value", module_statement, context))
          continue

        if not (func_name in module_variables):
          func = FuncDef()
          module_variables[func_name] = ClassDefWithTypeArgs(func, type_args=list())
        else:
          func = module_variables[func_name]

          if not isinstance(func, FuncDef):
            analysis.errors.append(StaticAnalysisDiagnostic("Duplicate variable", module_statement, context))
            continue

        func.overloads.append(overload)

      case _:
        print("Missing", module_statement)
        analysis.errors.append(StaticAnalysisDiagnostic("Invalid operation", module_statement, context))

  # from pprint import pprint
  # pprint(declarations)

  return analysis, (
    { name: cast(ExportedKnownTypeDef, type_def) for name, type_def in module_type_defs.items() if not isinstance(type_def, TypeVarDef) },
    module_variables
  )

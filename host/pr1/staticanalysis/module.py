import ast
from types import EllipsisType
from typing import Optional

from .function import parse_func

from .context import (StaticAnalysisAnalysis, StaticAnalysisContext,
                      StaticAnalysisDiagnostic)
from .expression import evaluate_eval_expr
from .special import CoreTypeDefs, GenericClassDef
from .type import evaluate_type_expr, instantiate_type
from .types import (ClassConstructorDef, ClassDef, ClassDefWithTypeArgs,
                    FuncDef, FuncOverloadDef, OrderedTypeVariables, TypeDefs,
                    TypeInstances, TypeVarDef, TypeVariables)


def evaluate_library_module(
  module: ast.Module,
  foreign_type_defs: TypeDefs,
  foreign_variables: TypeInstances,
  context: StaticAnalysisContext
):
  analysis = StaticAnalysisAnalysis()

  module_type_defs = TypeDefs()
  module_variables = TypeInstances()

  # print(ast.dump(module, indent=2))

  for module_statement in module.body:
    match module_statement:
      case ast.AnnAssign(target=ast.Name(id=variable_name, ctx=ast.Store()), annotation=ann, value=None, simple=1):
        if variable_name in module_variables:
          analysis.errors.append(StaticAnalysisDiagnostic("Duplicate variable declaration", module_statement.target, context))
          continue

        assert not (variable_name in module_variables)

        module_variables[variable_name] = analysis.add(evaluate_type_expr(ann, foreign_type_defs | module_type_defs, TypeVariables(), context))

      # case ast.Assign(
      #   targets=[ast.Name(type_var_name, ctx=ast.Store())],
      #   value=ast.Call(
      #     args=[ast.Constant(arg_name)],
      #     func=ast.Name(id='TypeVar', ctx=ast.Load())
      #   )
      # ):
      #   assert type_var_name == arg_name
      #   values[name] = TypeVarDef(name)

      case ast.Assign(
        targets=[ast.Name(id=name, ctx=ast.Store())],
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

              potential_type_variables = analysis.add_sequence([evaluate_type_expr(arg, (foreign_type_defs | module_type_defs), TypeVariables(), context) for arg in expr_args])
              type_variables = OrderedTypeVariables()

              for potential_type_variable, type_variable_node in zip(potential_type_variables, expr_args):
                if not isinstance(potential_type_variable, TypeVarDef):
                  analysis.errors.append(StaticAnalysisDiagnostic("Invalid type variable", type_variable_node, context))
                elif potential_type_variable in type_variables:
                  analysis.errors.append(StaticAnalysisDiagnostic("Duplicate type variable", type_variable_node, context))
                else:
                  type_variables.append(potential_type_variable)

              continue


          base_type = analysis.add(evaluate_eval_expr(class_base, foreign_variables | module_variables, TypeVariables(), context))

          # if not isinstance(base_type, TypeClassRef):
          #   analysis.errors.append(StaticAnalysisDiagnostic("Invalid base value", module_statement, context, name='invalid_base'))
          #   continue

          # base_ref = cast(ClassRef[InnerType], base_type.extract())

          # if isinstance(base_ref, GenericClassRef):
          #   assert not generics_set
          #   cls.generics = base_ref.generics
          #   generics_set = True
          # else:
          #   cls.bases.append(base_ref)

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

              cls.class_attrs[attr_name] = instantiate_type(analysis.add(evaluate_type_expr(attr_ann, foreign_variables | module_variables, TypeVariables(), context)))

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
              raise Exception

        if not init_func.overloads:
          init_func.overloads.append(FuncOverloadDef(
            args_both=list(),
            args_kwonly=list(),
            args_posonly=list(),
            default_count=0,
            return_type=CoreTypeDefs['None']
          ))

      case ast.FunctionDef(name=func_name):
        overload = analysis.add(parse_func(module_statement, variables | values, context))

        if not (func_name in values):
          func = FuncDef()
          values[func_name] = ClassRef(func)
        else:
          func_ref = values[func_name]
          assert isinstance(func_ref, ClassRef)

          func = func_ref.cls
          assert isinstance(func, FuncDef)

        func.overloads.append(overload)

      case _:
        print("Missing", module_statement)
        raise Exception

  # from pprint import pprint
  # pprint(declarations)

  return analysis, (
    { name: type_def for name, type_def in module_type_defs.items() if not isinstance(type_def, TypeVarDef) },
    module_variables
  )

  # Variables({ name: value for name, value in module_variables.items() if not isinstance(value, TypeVarDef) })

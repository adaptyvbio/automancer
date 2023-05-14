import ast
from types import EllipsisType, NoneType
from typing import Any

from .special import CoreVariables
from .context import StaticAnalysisAnalysis, StaticAnalysisContext
from .expression import accept_type_as_instantiable, evaluate_type
from .types import AnyType, ClassDef, FuncDef, FuncOverloadDef, GenericClassDefWithGenerics, Instance, TypeVarDef, TypeVariables, Variables


def evaluate_library_module(module: ast.Module, /, foreign_variables: Variables, context: StaticAnalysisContext):
  analysis = StaticAnalysisAnalysis()
  module_variables = dict[str, AnyType]()

  # print(ast.dump(module, indent=2))

  for module_statement in module.body:
    match module_statement:
      case ast.AnnAssign(target=ast.Name(id=name, ctx=ast.Store()), annotation=ann, value=None, simple=1):
        assert not (name in module_variables)

        ann_type = analysis.add(evaluate_type(ann, foreign_variables | module_variables, TypeVariables(), context))
        module_variables[name] = Instance(analysis.add(accept_type_as_instantiable(ann_type)))

      # case ast.Assign(
      #   targets=[ast.Name(name, ctx=ast.Store())],
      #   value=ast.Call(
      #     args=[ast.Constant(arg_name)],
      #     func=ast.Name(id='TypeVar', ctx=ast.Load())
      #   )
      # ):
      #   assert name == arg_name
      #   values[name] = TypeVarDef(name)

      case ast.Assign(
        targets=[ast.Name(id=name, ctx=ast.Store())],
        value=value
      ):
        module_variables[name] = analysis.add(evaluate_type(value, foreign_variables | module_variables, TypeVariables(), context))

      case ast.ClassDef(name=class_name, bases=class_bases, body=class_body):
        cls = ClassDef(class_name)
        type_variables_set = False

        for class_base in class_bases:
          base_type = analysis.add(evaluate_type(class_base, foreign_variables | module_variables, TypeVariables(), context))

          if isinstance(base_type, GenericClassDefWithGenerics) and (not type_variables_set):
            cls.type_variables = base_type.type_variables
            type_variables_set = True
          else:
            raise Exception

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

        module_variables[class_name] = cls

        init_func = FuncDef()
        cls.instance_attrs['__init__'] = init_func

        type_variables = set(cls.type_variables)

        for class_statement in class_body:
          match class_statement:
            # foo: int
            case ast.AnnAssign(target=ast.Name(id=attr_name, ctx=ast.Store()), annotation=attr_ann, value=None, simple=1):
              if attr_name in cls.class_attrs:
                raise Exception("Duplicate class attribute")

              cls.class_attrs[attr_name] = analysis.add(evaluate_type(attr_ann, foreign_variables | module_variables, type_variables, context))

            # self.foo: int
            case ast.AnnAssign(target=ast.Attribute(attr=attr_name, value=ast.Name(id='self')), annotation=attr_ann, simple=0):
              if attr_name in cls.instance_attrs:
                raise Exception("Duplicate instance attribute")

              ann_type = analysis.add(evaluate_type(attr_ann, foreign_variables | module_variables, type_variables, context))
              cls.instance_attrs[attr_name] = Instance(analysis.add(accept_type_as_instantiable(ann_type, type_variables)))

            case ast.FunctionDef(name=func_name):
              overload = analysis.add(parse_func(class_statement, variables | values, context))
              assert (overload.args_posonly + overload.args_both)[0].name == 'self'

              if overload.args_posonly:
                overload.args_posonly = overload.args_posonly[1:]
              else:
                overload.args_both = overload.args_both[1:]

              if not (func_name in cls.instance_attrs):
                func = FuncDef(generics=cls.generics)
                cls.instance_attrs[func_name] = ClassRef(func)
              else:
                assert isinstance(func_ref := cls.instance_attrs[func_name], ClassRef)
                assert isinstance(func := func_ref.cls, FuncDef)

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
            return_type=CoreVariables['None']
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
        raise Exception

  # from pprint import pprint
  # pprint(declarations)

  return analysis, Variables({ name: value for name, value in module_variables.items() if not isinstance(value, TypeVarDef) })

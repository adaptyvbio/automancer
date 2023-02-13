import ast
import builtins
from collections import ChainMap
from dataclasses import KW_ONLY, dataclass, field
from types import GenericAlias
from typing import Any, Literal, Optional, cast


## Type system

@dataclass
class TypeVarDef:
  name: str

@dataclass
class FuncArgDef:
  # has_default: bool = False
  name: str
  type: 'Optional[ClassRef | TypeVarDef]'

@dataclass
class FuncOverloadDef:
  args_pos: list[FuncArgDef]
  args_both: list[FuncArgDef]
  args_kw: list[FuncArgDef]
  return_type: 'Optional[ClassRef | TypeVarDef]'

@dataclass
class ClassDef:
  name: str
  _: KW_ONLY
  bases: 'list[ClassRef]' = field(default_factory=list)
  generics: list[TypeVarDef] = field(default_factory=list)
  class_attrs: 'dict[str, ClassRef | TypeVarDef]' = field(default_factory=dict)
  instance_attrs: 'dict[str, ClassRef | TypeVarDef]' = field(default_factory=dict)

@dataclass
class FuncDef(ClassDef):
  name: str = 'function'
  overloads: list[FuncOverloadDef] = field(default_factory=list)

  def __post_init__(self):
    self.instance_attrs={ '__call__': ClassRef(self) }

@dataclass
class ClassRef:
  cls: ClassDef
  _: KW_ONLY
  arguments: 'list[ClassRef | TypeVarDef]' = field(default_factory=list)


@dataclass
class GenericClassDef(ClassDef):
  def __init__(self):
    super().__init__('Generic')


## Builtins types & Prelude

Variables = dict[str, ClassRef]
VariableOrTypeDefs = dict[str, ClassRef | TypeVarDef]

FunctionType = ClassDef('function')
MethodType = ClassDef('method')
NoneType = ClassDef('None')
UnionType = ClassDef('Union')
TypeType = ClassDef('type', generics=[TypeVarDef('T')])

PreludeVariables = Variables({
  'Generic': ClassRef(GenericClassDef()),
  'NoneType': ClassRef(NoneType),
  'Union': ClassRef(UnionType),

  # 'float': ClassDef('float'),
  # 'int': ClassDef('int'),
  'type': ClassRef(TypeType)
})


## Utility functions

# TODO: Accept class generics here
def parse_type(node: ast.expr, /, variables: VariableOrTypeDefs, *, resolve_types: bool = True):
  match node:
    case ast.BinOp(left=left, op=ast.BitOr(), right=right):
      return ClassRef(UnionType, arguments=[parse_type(left, variables), parse_type(right, variables)])

    case ast.Constant(None):
      return ClassRef(NoneType)

    case ast.Name(id=name, ctx=ast.Load()):
      value = variables[name]

      match value:
        case ClassDef() if (not resolve_types):
          return ClassRef(value)
        case ClassRef() if (not resolve_types):
          return value
        case ClassRef(cls=cls, arguments=[ClassRef()]) if resolve_types and (cls is TypeType):
          return value.arguments[0]
        case TypeVarDef():
          return value
        case _:
          raise Exception

    case ast.Subscript(value=ast.Name(id=name, ctx=ast.Load()), slice=subscript, ctx=ast.Load()):
      cls = variables[name]
      assert isinstance(cls, ClassDef)

      match subscript:
        case ast.Tuple(subscript_args, ctx=ast.Load()):
          expr_args = subscript_args
        case _:
          expr_args = [subscript]

      args = list[ClassRef | TypeVarDef]()

      for arg in expr_args:
        arg_value = parse_type(arg, variables)
        args.append(arg_value)

        if isinstance(cls, GenericClassDef):
          assert isinstance(arg_value, TypeVarDef)

        assert isinstance(arg_value, (ClassRef, TypeVarDef))

        # match arg:
        #   case ast.Constant(None):
        #     assert not isinstance(cls, GenericClassDef)
        #     args.append(ClassRef(NoneType))

        #   case ast.Name(arg_name, ctx=ast.Load()):
        #     arg_value = variables[arg_name]

        #     if isinstance(cls, GenericClassDef):
        #       assert isinstance(arg_value, TypeVarDef)

        #     assert isinstance(arg_value, (ClassRef, TypeVarDef))

        #     args.append(arg_value)
        #   case _:
        #     raise Exception

      if not isinstance(cls, GenericClassDef) and (cls is not UnionType):
        assert len(args) == len(cls.generics)

      return ClassRef(
        arguments=args,
        cls=cls
      )

    case _:
      raise Exception


def parse_func(node: ast.FunctionDef, /, variables: VariableOrTypeDefs):
  process_args = lambda args: [FuncArgDef(
    name=arg.arg,
    type=(arg.annotation and parse_type(arg.annotation, variables))
  ) for arg in args]

  return FuncOverloadDef(
    args_pos=process_args(node.args.posonlyargs),
    args_both=process_args(node.args.args),
    args_kw=process_args(node.args.kwonlyargs),
    return_type=(node.returns and parse_type(node.returns, variables))
  )


## Main function

def process_module(module: ast.Module, /, variables: VariableOrTypeDefs) -> Variables:
  values = VariableOrTypeDefs()

  for module_statement in module.body:
    match module_statement:
      case ast.AnnAssign(target=ast.Name(id=name, ctx=ast.Store()), annotation=attr_ann, value=None, simple=1):
        assert not (name in values)
        result_type = parse_type(attr_ann, variables | values)

        assert isinstance(result_type, ClassRef)
        values[name] = result_type

      case ast.Assign(
        targets=[ast.Name(name, ctx=ast.Store())],
        value=ast.Call(
          args=[ast.Constant(arg_name)],
          func=ast.Name(id='TypeVar', ctx=ast.Load())
        )
      ):
        assert name == arg_name
        values[name] = TypeVarDef(name)

      case ast.Assign(
        targets=[ast.Name(id=name, ctx=ast.Store())],
        value=value
      ):
        values[name] = parse_type(value, variables | values, resolve_types=False)

      case ast.ClassDef(name=class_name, bases=class_bases, body=class_body):
        cls = ClassDef(class_name)
        generics_set = False

        for class_base in class_bases:
          base = parse_type(class_base, variables | values, resolve_types=False)
          assert isinstance(base, ClassRef) and (base.cls is TypeType)

          ref = base.arguments[0]
          assert isinstance(ref, ClassRef)

          cls.bases.append(ref)

          if isinstance(ref.cls, GenericClassDef):
            assert not generics_set
            cls.generics = cast(list[TypeVarDef], ref.arguments)
            generics_set = True

        values[class_name] = ClassRef(TypeType, arguments=[ClassRef(cls)])

        for class_statement in class_body:
          match class_statement:
            case ast.AnnAssign(target=ast.Name(id=attr_name, ctx=ast.Store()), annotation=attr_ann, value=None, simple=1):
              assert not (attr_name in cls.class_attrs)
              assert not (attr_name in cls.instance_attrs)

              cls.instance_attrs[attr_name] = parse_type(attr_ann, variables | values)

            case ast.FunctionDef(name=func_name):
              overload = parse_func(class_statement, variables | values)

              # if overload.args_pos:
              #   match overload.args_pos[0].name:
              #     case 'cls':
              #       kind = 'class'
              #     case 'self':
              #       kind = 'instance'
              #     case _:
              #       kind = 'static'
              # else:
              #   kind = 'static'

              # if kind == 'self':
              #   assert not (func_name in cls.instance_attrs)
              # else:
              #   assert not (func_name in cls.class_attrs)

              # if not (func_name in cls.methods):
              #   cls.methods[func_name] = MethodDef(kind=kind)

              # cls.methods[func_name].overloads.append(overload)

              assert (overload.args_pos + overload.args_both)[0].name == 'self'

              if overload.args_pos:
                overload.args_pos = overload.args_pos[1:]
              else:
                overload.args_both = overload.args_both[1:]

              if not (func_name in cls.instance_attrs):
                func = FuncDef()
                cls.instance_attrs[func_name] = ClassRef(func)
              else:
                assert isinstance(func_ref := cls.instance_attrs[func_name], ClassRef)
                assert isinstance(func := func_ref.cls, FuncDef)

              func.overloads.append(overload)

            case ast.Pass():
              pass

            case _:
              raise Exception

      case ast.FunctionDef(name=func_name):
        overload = parse_func(module_statement, variables | values)

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

  return { name: value for name, value in values.items() if not isinstance(value, TypeVarDef) }

def process_source(contents: str, /, variables):
  module = ast.parse(contents)
  return process_module(module, variables)


## Evaluation checker

# def check_call(func: FuncDef, /, args: list[ClassRef], kwargs: dict[str, ClassRef]):
#   for overload in func.overloads:
#     return overload.return_type

def check(node: ast.expr, /, builtin_variables: Variables, variables: Variables):
  print(ast.dump(node, indent=2))

  match node:
    # case ast.BinOp(left=left, right=right, op=ast.Add()):
    #   left_type = check(left, builtin_variables, variables)
    #   right_type = check(right, builtin_variables, variables)

    #   if '__add__' in left_type.instance_attrs:
    #     return

    #   print(left_type)
    #   print(right_type)

    case ast.Call(func, args, keywords):
      func_ref = check(func, builtin_variables, variables)
      assert isinstance(func_ref.cls, FuncDef)

      for overload in func_ref.cls.overloads:
        return overload.return_type

      raise Exception

    case ast.Constant(builtins.int()):
      return builtin_variables['int'].arguments[0] # type: ignore

    case ast.Name(id=name, ctx=ast.Load()):
      return variables[name]

    case _:
      raise Exception


## Tests

if __name__ == "__main__":
  # tree = ast.parse("((y := 1.0) if x[0+1] else (y := 5.0)) + y", mode='eval').body
  # stack = {
  #   'devices': dict[str, int],
  #   'x': list[bool]
  # }

  devices = ClassRef(ClassDef(
    name='Devices',
    instance_attrs={
      'Okolab': ClassRef(ClassDef(
        name='OkolabDevice',
        instance_attrs={
          'temperature': ClassRef(ClassDef('float'))
        }
      ))
    }
  ))

  BuiltinVariables = process_source("""
class int:
  def __add__(self, other: int, /) -> int:
    pass

# class list:
#   def get(self, index: int) -> T | None:
#     ...

# class dict(Generic[K, V]):
#   def __new__(cls, x: int, /, y, *, z, e = 5):
#     ...

#   def get(self, key: K, /) -> Optional[V]:
#     ...
""", PreludeVariables)

  AuxVariables = process_source("""
x: int
""", PreludeVariables | BuiltinVariables)

  # tree = ast.parse("devices.get", mode='eval').body
  # print(ast.dump(tree, indent=2))
  # print(analyze(tree, stack=ChainMap({}, stack)))

  # print()
  # print()

  from pprint import pprint
  # pprint(BuiltinVariables)

  # print(check(ast.parse("356 + x", mode='eval').body, PreludeVariables | BuiltinVariables, AuxVariables))


# see: typing.get_type_hints

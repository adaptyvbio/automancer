import ast
import builtins
from collections import ChainMap
from dataclasses import KW_ONLY, dataclass, field
from types import EllipsisType, GenericAlias
from typing import Any, Literal, Optional, cast


## Type system

@dataclass
class TypeVarDef:
  name: str

@dataclass(kw_only=True)
class FuncArgDef:
  name: str
  type: 'Optional[ClassRef | TypeVarDef]'

@dataclass(kw_only=True)
class FuncKwArgDef(FuncArgDef):
  has_default: bool

@dataclass(kw_only=True)
class FuncOverloadDef:
  args_posonly: list[FuncArgDef]
  args_both: list[FuncArgDef]
  args_kwonly: list[FuncKwArgDef]
  default_count: int
  return_type: 'Optional[ClassRef | TypeVarDef]'

  def __repr__(self):
    args = [
      *[f"{arg.name}" for arg in self.args_posonly],
      *(["/"] if self.args_posonly else list()),
      *[f"{arg.name}" for arg in self.args_both],
      *(["*"] if self.args_kwonly else list()),
      *[f"{arg.name}" for arg in self.args_kwonly]
    ]

    return f"{self.__class__.__name__}({', '.join(args)})"

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
  process_arg_type = lambda annotation: (annotation and parse_type(annotation, variables))

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

  return FuncOverloadDef(
    args_posonly=args_pos,
    args_both=args_both,
    args_kwonly=args_kw,
    default_count=len(node.args.defaults),
    return_type=(node.returns and parse_type(node.returns, variables))
  )


## Process module

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
              assert (overload.args_posonly + overload.args_both)[0].name == 'self'

              if overload.args_posonly:
                overload.args_posonly = overload.args_posonly[1:]
              else:
                overload.args_both = overload.args_both[1:]

              if not (func_name in cls.instance_attrs):
                func = FuncDef()
                cls.instance_attrs[func_name] = ClassRef(func)
              else:
                assert isinstance(func_ref := cls.instance_attrs[func_name], ClassRef)
                assert isinstance(func := func_ref.cls, FuncDef)

              func.overloads.append(overload)

            case ast.Expr(ast.Constant(EllipsisType())) | ast.Pass():
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
  # print(ast.dump(module, indent=2))

  return process_module(module, variables)


## Evaluation checker

# def check_call(func: FuncDef, /, args: list[ClassRef], kwargs: dict[str, ClassRef]):
#   for overload in func.overloads:
#     return overload.return_type

def check(node: ast.expr, /, builtin_variables: Variables, variables: Variables):
  # print(ast.dump(node, indent=2))

  match node:
    case ast.BinOp(left=left, right=right, op=ast.Add()):
      left_type = check(left, builtin_variables, variables)
      right_type = check(right, builtin_variables, variables)

      if '__add__' in left_type.cls.instance_attrs:
        overload = find_overload(left_type.cls.instance_attrs['__add__'].cls, args=[right_type], kwargs=dict())

        if overload:
          return overload.return_type

    case ast.Call(func, args, keywords):
      func_ref = check(func, builtin_variables, variables)

      args = [check(arg, builtin_variables, variables) for arg in args]
      kwargs = { keyword.arg: check(keyword.value, builtin_variables, variables) for keyword in keywords if keyword.arg }

      if func_ref.cls is TypeType:
        target = func_ref.arguments[0]

        if '__init__' in target.cls.instance_attrs:
          overload = find_overload(target.cls.instance_attrs['__init__'].cls, args=args, kwargs=kwargs)
          assert overload

        return target

      assert isinstance(func_ref.cls, FuncDef)

      overload = find_overload(func_ref.cls, args=args, kwargs=kwargs)

      assert overload
      return overload.return_type

    case ast.Constant(builtins.int()):
      return builtin_variables['int'].arguments[0] # type: ignore

    case ast.Name(id=name, ctx=ast.Load()):
      return variables[name]

    case _:
      raise Exception

# Checks if lhs < rhs (lhs is a subtype of rhs)
def check_type(lhs: ClassRef, rhs: ClassRef, /):
  for base in [lhs, *lhs.cls.bases]:
    if base.cls is rhs.cls:
      return True

  return False

def find_overload(func: FuncDef, /, args: list[ClassRef], kwargs: dict[str, ClassRef]):
  for overload in func.overloads:
    args_pos = overload.args_posonly + overload.args_both
    args_kw = overload.args_kwonly + overload.args_both

    args_pos_index = 0
    args_kw_written = set[str]()

    failure = False

    for input_arg in args:
      if args_pos_index >= len(args_pos):
        failure = True
        break

      arg = args_pos[args_pos_index]
      args_pos_index += 1

      if (arg.type is not None) and (not check_type(input_arg, arg.type)): # type: ignore
        failure = True
        break

    for input_arg_name, input_arg in kwargs.items():
      arg = next((arg for arg in args_kw if arg.name == input_arg_name), None)

      if arg is None:
        failure = True
        break

      args_kw_written.add(arg.name)

      if (arg.type is not None) and (not check_type(input_arg, arg.type)): # type: ignore
        failure = True
        break

    if failure:
      continue

    if any((arg.name not in args_kw_written) and (not arg.has_default) for arg in overload.args_kwonly):
      continue

    if any((arg.name not in args_kw_written) for arg in overload.args_both[max(0, args_pos_index - len(overload.args_posonly)):(-overload.default_count if overload.default_count > 0 else None)]):
      continue

    if args_pos_index < (len(args_pos) - overload.default_count):
      continue

    return overload

  return None


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
    ...
""", PreludeVariables)

  AuxVariables = process_source("""
x: int

class A:
  # def __init__(self):
  ...

class B(A):
  ...

def foo(a: A) -> int:
  ...
""", PreludeVariables | BuiltinVariables)

  # tree = ast.parse("devices.get", mode='eval').body
  # print(ast.dump(tree, indent=2))
  # print(analyze(tree, stack=ChainMap({}, stack)))

  # print()
  # print()

  from pprint import pprint

  # print()
  # pprint(BuiltinVariables)
  # print()

  # pprint(BuiltinVariables['x'])
  # i = BuiltinVariables['int']

  # print(find_overload(BuiltinVariables['foo'].cls, [i, i], { 'c': i, 'd': i }))
  # print(find_overload(BuiltinVariables['foo'].cls, [], {}))

  # pprint(BuiltinVariables)

  print(check(ast.parse("(356 + x) + foo(B())", mode='eval').body, PreludeVariables | BuiltinVariables, AuxVariables))


# see: typing.get_type_hints


# from typing import Generic, TypeVar

# T = TypeVar('T')

# class X(Generic[T]):
#   class Y:
#     def foo(self) -> T:
#       ...

#   def a(self):
#     return self.Y()


# a = X[int]().a()
# b = a.foo()
# print(b + 1)

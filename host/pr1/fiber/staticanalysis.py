import ast
import builtins
from collections import ChainMap
from dataclasses import KW_ONLY, dataclass, field
from pprint import pprint
from types import EllipsisType, GenericAlias
from typing import Any, Literal, Optional, TypeVar, cast


## Type system

@dataclass
class TypeVarDef:
  name: str

  def __hash__(self):
    return id(self)

@dataclass
class TypeVarTupleDef:
  name: str

  def __hash__(self):
    return id(self)

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
class ClassGenericsDef:
  before_tuple: list[TypeVarDef] = field(default_factory=list)
  _: KW_ONLY
  tuple: Optional[TypeVarTupleDef] = None
  after_tuple: list[TypeVarDef] = field(default_factory=list)

  def format(self):
    return [
      *[arg.name for arg in self.before_tuple],
      *(f"*{self.tuple.name}" if self.tuple else list()),
      *[arg.name for arg in self.after_tuple]
    ]

@dataclass
class ClassDef:
  name: str
  _: KW_ONLY
  bases: 'list[ClassRef]' = field(default_factory=list)
  generics: ClassGenericsDef = field(default_factory=ClassGenericsDef)
  class_attrs: 'dict[str, ClassRef | TypeVarDef]' = field(default_factory=dict)
  instance_attrs: 'dict[str, ClassRef | TypeVarDef]' = field(default_factory=dict)

  def __repr__(self):
    generics = self.generics.format()
    return f"<{self.__class__.__name__} {self.name}" + (f"[{', '.join(generics)}]" if generics else str()) + ">"

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
  arguments: 'Optional[dict[TypeVarDef, ClassRef]]' = None
  context: 'dict[TypeVarDef, ClassRef]' = field(default_factory=dict)

  def mro(self):
    yield self

    for base_ref in self.cls.bases:
      yield base_ref


GenericType = ClassDef('Generic')

class GenericClassRef(ClassRef):
  def __init__(self, generics: ClassGenericsDef, /):
    super().__init__(GenericType)
    self.generics = generics


TypeType = ClassDef('type', generics=ClassGenericsDef([TypeVarDef('TypeT')]))

class TypeClassRef(ClassRef):
  def __init__(self, ref: ClassRef, /):
    super().__init__(TypeType, arguments={ TypeType.generics.before_tuple[0]: ref })

  def extract(self):
    assert self.arguments is not None
    return self.arguments[TypeType.generics.before_tuple[0]]


## Builtins types & Prelude

Variables = dict[str, ClassRef]
VariableOrTypeDefs = dict[str, ClassRef | TypeVarDef]

FunctionType = ClassDef('function')
MethodType = ClassDef('method')
NoneType = ClassDef('None')
UnionType = ClassDef('Union')

PreludeVariables = Variables({
  'Generic': TypeClassRef(ClassRef(GenericType)),
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
    # case ast.BinOp(left=left, op=ast.BitOr(), right=right):
    #   return ClassRef(UnionType, arguments=[parse_type(left, variables), parse_type(right, variables)])

    case ast.Constant(None):
      return ClassRef(NoneType)

    case ast.Name(id=name, ctx=ast.Load()):
      value = variables[name]

      match value:
        case ClassDef() if (not resolve_types):
          return ClassRef(value)
        case ClassRef() if (not resolve_types):
          return value
        case TypeClassRef() if resolve_types:
          return value.extract()
        # case ClassRef(cls) if resolve_types and (cls is TypeType):
        #   print(value)
        #   assert value.arguments is not None
        #   return value.arguments[cls.generics[0]]
        case TypeVarDef():
          return value
        case _:
          raise Exception

    case ast.Subscript(value=ast.Name(id=name, ctx=ast.Load()), slice=subscript, ctx=ast.Load()):
      type_ref = variables[name]
      assert isinstance(type_ref, TypeClassRef)
      ref = type_ref.extract()

      assert ref.arguments is None

      match subscript:
        case ast.Tuple(subscript_args, ctx=ast.Load()):
          expr_args = subscript_args
        case _:
          expr_args = [subscript]

      args = list[ClassRef | TypeVarDef]()

      for arg in expr_args:
        arg_value = parse_type(arg, variables)
        args.append(arg_value)

        if ref.cls is GenericType:
          assert isinstance(arg_value, TypeVarDef)
        else:
          assert isinstance(arg_value, ClassRef)

      # TODO: Handle union types

      if ref.cls is GenericType:
        return TypeClassRef(
          GenericClassRef(ClassGenericsDef(
            before_tuple=cast(list[TypeVarDef], args)
          ))
        )

      new_ref = ClassRef(
        arguments={ typevar: arg for typevar, arg in zip(ref.cls.generics.before_tuple, cast(list[ClassRef], args)) },
        cls=ref.cls
      )

      return new_ref if resolve_types else TypeClassRef(new_ref)

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
          base_type_ref = parse_type(class_base, variables | values, resolve_types=False)
          assert isinstance(base_type_ref, TypeClassRef)
          base_ref = base_type_ref.extract()

          if isinstance(base_ref, GenericClassRef):
            assert not generics_set
            cls.generics = base_ref.generics
            generics_set = True
          else:
            cls.bases.append(base_ref)

        values[class_name] = TypeClassRef(ClassRef(cls))

        for class_statement in class_body:
          match class_statement:
            case ast.AnnAssign(target=ast.Name(id=attr_name, ctx=ast.Store()), annotation=attr_ann, value=None, simple=1):
              if attr_name in cls.class_attrs:
                raise Exception("Duplicate class attribute")

              cls.class_attrs[attr_name] = parse_type(attr_ann, variables | values)

            case ast.AnnAssign(target=ast.Attribute(attr=attr_name, value=ast.Name(id='self')), annotation=attr_ann, simple=0):
              if attr_name in cls.instance_attrs:
                raise Exception("Duplicate instance attribute")

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
              print('Missing', ast.dump(class_statement, indent=2))
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

def resolve_generics(input_type: ClassRef | TypeVarDef, /, generics: dict[TypeVarDef, ClassRef]):
  match input_type:
    case ClassRef(cls, arguments=args):
      return ClassRef(cls, arguments=args, context=generics)

    case TypeVarDef():
      return generics[input_type]

    case _:
      raise Exception


BinOpMethodMap: dict[type[ast.operator], str] = {
  ast.Add: 'add',
  ast.BitAnd: 'and',
  ast.Mod: 'divmod',
  ast.FloorDiv: 'floordiv',
  ast.LShift: 'lshift',
  ast.MatMult: 'matmul',
  ast.Mod: 'mod',
  ast.Mult: 'mul',
  ast.BitOr: 'or',
  ast.Pow: 'pow',
  ast.RShift: 'rshift',
  ast.Sub: 'sub',
  ast.Div: 'truediv',
  ast.BitXor: 'xor'
}

def evaluate(node: ast.expr, /, builtin_variables: Variables, variables: Variables, *, generics: Optional[dict[TypeVarDef, ClassRef]] = None):
  # print(ast.dump(node, indent=2))

  match node:
    case ast.Attribute(value, attr=attr_name, ctx=ast.Load()):
      value_type = evaluate(value, builtin_variables, variables)

      if isinstance(value_type, TypeClassRef):
        for class_ref in value_type.extract().mro():
          if attr := class_ref.cls.instance_attrs.get(attr_name):
            return resolve_generics(attr, (class_ref.arguments or dict()))

      for class_ref in value_type.mro():
        if attr := class_ref.cls.instance_attrs.get(attr_name):
          return resolve_generics(attr, (class_ref.arguments or dict()))

      raise Exception("Missing attribute")

    case ast.BinOp(left=left, right=right, op=op):
      left_type = evaluate(left, builtin_variables, variables)
      right_type = evaluate(right, builtin_variables, variables)

      operator_name = BinOpMethodMap[op.__class__]

      if (method := left_type.cls.instance_attrs.get(f"__{operator_name}__"))\
        and (overload := find_overload(method, args=[right_type], kwargs=dict())):
        return overload.return_type

      if (method := right_type.cls.instance_attrs.get(f"__r{operator_name}__"))\
        and (overload := find_overload(method, args=[left_type], kwargs=dict())):
        return overload.return_type

      raise Exception("Invalid operation")

    case ast.Call(func, args, keywords):
      func_ref = evaluate(func, builtin_variables, variables)

      args = [evaluate(arg, builtin_variables, variables) for arg in args]
      kwargs = { keyword.arg: evaluate(keyword.value, builtin_variables, variables) for keyword in keywords if keyword.arg }

      if func_ref.cls is TypeType:
        target = func_ref.extract()

        if '__init__' in target.cls.instance_attrs:
          overload = find_overload(target.cls.instance_attrs['__init__'], args=args, kwargs=kwargs)
          assert overload

        return target

      assert isinstance(func_ref.cls, FuncDef)

      overload = find_overload(func_ref, args=args, kwargs=kwargs)

      assert overload
      return resolve_generics(overload.return_type, func_ref.context) if overload.return_type else None

    case ast.Constant(builtins.float()):
      assert isinstance(const_type := builtin_variables['float'], TypeClassRef)
      return const_type.extract()

    case ast.Constant(builtins.int()):
      assert isinstance(const_type := builtin_variables['int'], TypeClassRef)
      return const_type.extract()

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

def find_overload(func_ref: ClassRef, /, args: list[ClassRef], kwargs: dict[str, ClassRef]):
  func = func_ref.cls
  assert isinstance(func, FuncDef)

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
  def __add__(self, other: int, /) -> int: ...
  def __mul__(self, other: int, /) -> int: ...

class float:
  def __add__(self, other: float, /) -> float: ...
  def __add__(self, other: int, /) -> float: ...
  def __radd__(self, other: int, /) -> float: ...
  def __mul__(self, other: float, /) -> float: ...
  def __mul__(self, other: int, /) -> float: ...
  def __rmul__(self, other: int, /) -> float: ...
""", PreludeVariables)

  AuxVariables = process_source("""
# U = TypeVar('U')

# class list(Generic[U]):
#   def a(self) -> U:
#     ...

# x: int
# y: list[int]

class A:
  p: int
  self.x: int

class B(A):
  pass
""", PreludeVariables | BuiltinVariables)

  AuxVariables['devices'] = devices

  from pprint import pprint

  # print()
  # pprint(AuxVariables['A'].extract().cls.instance_attrs)
  # print()

  pprint(evaluate(ast.parse("devices.Okolab.temperature", mode='eval').body, PreludeVariables | BuiltinVariables, AuxVariables))

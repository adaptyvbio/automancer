import ast
import builtins
from collections import ChainMap
from dataclasses import KW_ONLY, dataclass, field
from types import GenericAlias
from typing import Any, Literal, Optional, cast

from .langservice import Analysis


class MissingType():
  pass

class Types():
  MissingType = MissingType

types = Types()

class InvalidOp():
  pass

def simplify(src: Any):
  return MissingType if issubclass(MissingType, src) else src

def analyze(expr: ast.expr, stack: ChainMap) -> tuple[Analysis, Any, set[str]]:
  match expr:
    case ast.Attribute(value, attr, ctx=ast.Load()):
      value_analysis, value_type, value_deps = analyze(value, stack=stack)
      print(value_type)

      match value_type:
        case GenericAlias(__origin__=builtins.list, __args__=(key_arg, value_arg)):
          match attr:
            case 'get':
              pass

      return value_analysis, types.MissingType, set()
    case ast.BinOp():
      left_analysis, left_type, left_deps = analyze(expr.left, stack=stack)
      right_analysis, right_type, right_deps = analyze(expr.right, stack=stack)
      analysis = left_analysis + right_analysis
      deps = left_deps | right_deps

      match left_type, right_type:
        case builtins.int, builtins.int:
          return analysis, builtins.int, deps
        case builtins.float | builtins.int, builtins.float | builtins.int:
          return analysis, builtins.float, deps

        case (types.MissingType, _) | (_, types.MissingType):
          return analysis, types.MissingType, deps
        case _:
          print("Invalid", ast.unparse(expr))
          print(left_type, right_type)

          analysis.errors.append(InvalidOp())
          return analysis, types.MissingType, deps

    case ast.Constant(value):
      return Analysis(), type(value), set()

    case ast.IfExp(test, body, orelse):
      test_analysis, test_type, test_deps = analyze(test, stack=stack)

      if_stack = stack.copy()
      else_stack = stack.copy()

      if_analysis, if_type, if_deps = analyze(body, stack=if_stack)
      else_analysis, else_type, else_deps = analyze(orelse, stack=else_stack)

      for name, if_type in if_stack.maps[0].items():
        if name in (else_map := else_stack.maps[0]):
          stack[name] = if_type | else_map[name]

      analysis = if_analysis + else_analysis + test_analysis
      deps = if_deps | else_deps | test_deps

      if test_type != bool:
        analysis.errors.append(InvalidOp())

      return analysis, simplify(if_type | else_type), deps

    case ast.Name(ctx=ast.Load(), id=name):
      if name in stack:
        return Analysis(), stack[name], ({name} if name in stack.maps[-1] else set())
      else:
        return Analysis(errors=[NameError(name)]), MissingType, set()

    case ast.NamedExpr(target=ast.Name(ctx=ast.Store(), id=name), value=value):
      value_analysis, value_type, value_deps = analyze(value, stack=stack)
      stack[name] = value_type
      return value_analysis, value_type, value_deps

    case ast.Subscript(value, slice, ctx=ast.Load()):
      value_analysis, value_type, value_deps = analyze(value, stack=stack)
      slice_analysis, slice_type, slice_deps = analyze(slice, stack=stack)

      analysis = value_analysis + slice_analysis
      deps = value_deps | slice_deps

      match value_type, slice:
        case GenericAlias(__origin__=builtins.tuple, __args__=args), ast.Constant(value=int(index)):
          return analysis, args[index], value_deps
        case GenericAlias(__origin__=builtins.tuple, __args__=args), _:
          output_type = args[0]

          for arg in args[1:]:
            output_type |= arg

          if slice_type != builtins.int:
            analysis.errors.append(IndexError())

          return analysis, output_type, deps
        case GenericAlias(__origin__=builtins.list, __args__=(arg,)), _:
          return analysis, arg, deps
        case _:
          raise Exception

    case ast.Tuple(elts, ctx=ast.Load()):
      analysis = Analysis()
      values = list()
      deps = set()

      for elt in elts:
        elt_analysis, elt_value, elt_deps = analyze(elt, stack=stack)
        analysis += elt_analysis
        values.append(elt_value)
        deps |= elt_deps

      return analysis, GenericAlias(tuple, tuple(values)), deps

    case _:
      print("Unknown", expr)
      raise Exception


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
  # required_arg_count: int
  return_type: 'Optional[ClassRef | TypeVarDef]'

# @dataclass
# class FuncDef:
#   overloads: list[FuncOverloadDef] = field(default_factory=list)

# @dataclass(kw_only=True)
# class MethodDef(FuncDef):
#   kind: Literal['class', 'instance', 'static']

@dataclass
class ClassDef:
  name: str
  _: KW_ONLY
  bases: 'list[ClassRef]' = field(default_factory=list)
  # class_attrs: 'dict[str, ClassRef | TypeVarDef]' = field(default_factory=dict)
  generics: list[TypeVarDef] = field(default_factory=list)
  # instance_attrs: 'dict[str, ClassRef | TypeVarDef]' = field(default_factory=dict)
  # methods: dict[str, MethodDef] = field(default_factory=dict)
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

# @dataclass
# class FuncOverloadDef:
#   args_pos: list[FuncArgDef]
#   args_both: list[FuncArgDef]
#   args_kw: list[FuncArgDef]
#   return_type: Optional[ClassRef | TypeVarDef]


@dataclass
class GenericClassDef(ClassDef):
  def __init__(self):
    super().__init__('Generic')


def process(module: ast.Module):
  FunctionType = ClassDef('function')
  MethodType = ClassDef('method')
  NoneType = ClassDef('None')
  UnionType = ClassDef('Union')
  TypeType = ClassDef('type', generics=[TypeVarDef('T')])

  declarations = dict[str, ClassRef]()

  variables: dict[str, Any] = {
    'Generic': GenericClassDef(),
    'NoneType': NoneType,
    'Union': UnionType,

    'float': ClassDef('float'),
    'int': ClassDef('int'),
    'type': TypeType
  }

  # TODO: Accept class generics here
  def parse_type(node: ast.expr):
    match node:
      case ast.BinOp(left=left, op=ast.BitOr(), right=right):
        return ClassRef(UnionType, arguments=[parse_type(left), parse_type(right)])

      case ast.Constant(None):
        return ClassRef(NoneType)

      case ast.Name(id=name, ctx=ast.Load()):
        value = variables[name]

        match value:
          case ClassDef():
            return ClassRef(value)
          case ClassRef():
            return value
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
          arg_value = parse_type(arg)
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

  def parse_func(node: ast.FunctionDef):
    process_args = lambda args: [FuncArgDef(
      name=arg.arg,
      type=(arg.annotation and parse_type(arg.annotation))
    ) for arg in args]

    return FuncOverloadDef(
      args_pos=process_args(func_args.posonlyargs),
      args_both=process_args(func_args.args),
      args_kw=process_args(func_args.kwonlyargs),
      return_type=(func_returns and parse_type(func_returns))
    )



  for module_statement in module.body:
    match module_statement:
      case ast.AnnAssign(target=ast.Name(id=name, ctx=ast.Store()), annotation=attr_ann, value=None, simple=1):
        assert not (name in declarations)
        declarations[name] = parse_type(attr_ann)

      case ast.Assign(
        targets=[ast.Name(name, ctx=ast.Store())],
        value=ast.Call(
          args=[ast.Constant(arg_name)],
          func=ast.Name(id='TypeVar', ctx=ast.Load())
        )
      ):
        assert name == arg_name
        variables[name] = TypeVarDef(name)

      case ast.Assign(
        targets=[ast.Name(id=name, ctx=ast.Store())],
        value=value
      ):
        variables[name] = parse_type(value)

      case ast.ClassDef(name=class_name, bases=class_bases, body=class_body):
        cls = ClassDef(class_name)
        generics_set = False

        for class_base in class_bases:
          ref = parse_type(class_base)
          cls.bases.append(ref)

          if isinstance(ref.cls, GenericClassDef):
            assert not generics_set
            cls.generics = cast(list[TypeVarDef], ref.arguments)
            generics_set = True

        for class_statement in class_body:
          match class_statement:
            case ast.AnnAssign(target=ast.Name(id=attr_name, ctx=ast.Store()), annotation=attr_ann, value=None, simple=1):
              assert not (attr_name in cls.class_attrs)
              assert not (attr_name in cls.instance_attrs)
              assert not (attr_name in cls.methods)

              cls.instance_attrs[attr_name] = parse_type(attr_ann)

            case ast.FunctionDef(name=func_name, args=func_args, returns=func_returns):
              # def process_args(args: list[ast.arg], defaults: list[ast.expr]):
              #   output_args = list[FuncArgDef]()

              #   for index, func_arg in enumerate(func_args.posonlyargs):
              #     arg_type = func_arg.annotation and parse_type(func_arg.annotation)
              #     output_args.append(FuncArgDef(has_default=False, type=arg_type))

              #   return output_args
              overload = parse_func(class_statement)

              if overload.args_pos:
                match overload.args_pos[0].name:
                  case 'cls':
                    kind = 'class'
                  case 'self':
                    kind = 'instance'
                  case _:
                    kind = 'static'
              else:
                kind = 'static'

              if kind == 'self':
                assert not (func_name in cls.instance_attrs)
              else:
                assert not (func_name in cls.class_attrs)

              if not (func_name in cls.methods):
                cls.methods[func_name] = MethodDef(kind=kind)

              cls.methods[func_name].overloads.append(overload)

            case ast.Pass():
              pass

            case _:
              raise Exception

        declarations[class_name] = ClassRef(TypeType, arguments=[ClassRef(cls)])
        variables[class_name] = cls

      case ast.FunctionDef(name=func_name, args=func_args, returns=func_returns):
        overload = parse_func(module_statement)

        if not (func_name in declarations):
          func = FuncDef()
          declarations[func_name] = ClassRef(func)
        else:
          func = declarations[func_name].cls
          assert isinstance(func, FuncDef)

        func.overloads.append(overload)

      case _:
        raise Exception

  # from pprint import pprint
  # pprint(declarations)

  return declarations


def check(node: ast.expr, declarations: dict[str, ClassRef]):
  print(ast.dump(node, indent=2))

  match node:
    case ast.Call(func, args, keywords):
      func_ref = check(func, declarations)
      assert isinstance(func_ref.cls, FuncDef)

      for overload in func_ref.cls.overloads:
        return overload.return_type

      raise Exception

    case ast.Name(id=name, ctx=ast.Load()):
      return declarations[name]

    case _:
      raise Exception


if __name__ == "__main__":
  # tree = ast.parse("((y := 1.0) if x[0+1] else (y := 5.0)) + y", mode='eval').body
  stack = {
    'devices': dict[str, int],
    'x': list[bool]
  }

  tree = ast.parse("""
def x() -> int:
  pass

# class list:
#   def get(self, index: int) -> T | None:
#     ...

# class dict(Generic[K, V]):
#   def __new__(cls, x: int, /, y, *, z, e = 5):
#     ...

#   def get(self, key: K, /) -> Optional[V]:
#     ...
""")

  # tree = ast.parse("devices.get", mode='eval').body
  # print(ast.dump(tree, indent=2))
  # print(analyze(tree, stack=ChainMap({}, stack)))

  print()
  print()

  decls = process(tree)
  print(check(ast.parse("x()", mode='eval').body, declarations=decls))


# see: typing.get_type_hints

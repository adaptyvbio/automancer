import ast
import builtins
from collections import ChainMap
from dataclasses import KW_ONLY, dataclass, field
from pprint import pprint
from types import EllipsisType, GenericAlias
from typing import Any, Generic, Literal, Mapping, Optional, Self, Sequence, TypeVar, cast

from ..document import Document
from ..error import Error, ErrorDocumentReference, ErrorReference
from ..reader import LocatedString, Source


## Type system

TypeT = TypeVar('TypeT', 'ClassRef', 'TypeVarDef')

@dataclass
class TypeVarDef:
  name: str

  def resolve(self, type_variables):
    return type_variables[self]

  def __hash__(self):
    return id(self)

  def __repr__(self):
    return f"<{self.__class__.__name__} {self.name}>"

@dataclass
class TypeVarTupleDef:
  name: str

  def __hash__(self):
    return id(self)

@dataclass(kw_only=True)
class FuncArgDef(Generic[TypeT]):
  name: str
  type: TypeT

  def resolve(self, type_variables):
    return self.__class__(
      name=self.name,
      type=self.type.resolve(type_variables)
    )

@dataclass(kw_only=True)
class FuncKwArgDef(FuncArgDef[TypeT], Generic[TypeT]):
  has_default: bool

  def resolve(self, type_variables):
    return self.__class__(
      has_default=self.has_default,
      name=self.name,
      type=self.type.resolve(type_variables)
    )

@dataclass(kw_only=True)
class FuncOverloadDef(Generic[TypeT]):
  args_posonly: list[FuncArgDef[TypeT]]
  args_both: list[FuncArgDef[TypeT]]
  args_kwonly: list[FuncKwArgDef[TypeT]]
  default_count: int
  return_type: TypeT

  def resolve(self, type_variables):
    return FuncOverloadDef(
      args_posonly=[arg.resolve(type_variables) for arg in self.args_posonly],
      args_both=[arg.resolve(type_variables) for arg in self.args_both],
      args_kwonly=[arg.resolve(type_variables) for arg in self.args_kwonly],
      default_count=self.default_count,
      return_type=self.return_type.resolve(type_variables)
    )

  def __repr__(self):
    args = [
      *[f"{arg.name}" for arg in self.args_posonly],
      *(["/"] if self.args_posonly else list()),
      *[f"{arg.name}" for arg in self.args_both],
      *(["*"] if self.args_kwonly else list()),
      *[f"{arg.name}" for arg in self.args_kwonly]
    ]

    return f"<{self.__class__.__name__} ({', '.join(args)}) -> {self.return_type!r}>"

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

  # def resolve(self, type_variables):
  #   return self.__class__(
  #     name,
  #     bases=[base.resolve(type_variables) for base in self.bases],
  #     generics=self.generics,
  #     class_attrs=
  #   )

  def __repr__(self):
    generics = self.generics.format()
    return f"<{self.__class__.__name__} {self.name}" + (f"[{', '.join(generics)}]" if generics else str()) + ">"

@dataclass
class FuncDef(ClassDef):
  name: str = 'function'
  overloads: list[FuncOverloadDef] = field(default_factory=list)

  def __post_init__(self):
    self.instance_attrs={ '__call__': ClassRef(self) }

  def __repr__(self):
    overloads = [repr(overload) for overload in self.overloads]
    return f"<{self.__class__.__name__} " + ", ".join(overloads) + ">"

@dataclass
class ClassRef(Generic[TypeT]):
  cls: ClassDef
  _: KW_ONLY
  arguments: 'Optional[dict[TypeVarDef, TypeT]]' = None
  # context: 'dict[TypeVarDef, ClassRef]' = field(default_factory=dict)

  def mro(self):
    yield self

    for base_ref in self.cls.bases:
      yield base_ref

  def resolve(self, type_variables):
    return self.__class__(
      self.cls,
      arguments=(
        { key: arg.resolve(type_variables) for key, arg in self.arguments.items() } if self.arguments is not None else dict()
      )
    )

  def resolve_inner(self):
    return self.__class__(
      self.cls.resolve(self.arguments),
      arguments=None
    )

  # def simplify(self):
  #   if self.cls is UnionType:
  #     assert self.arguments
  #     arguments = [arg.simplify() for arg in self.arguments]

  #     for first_index, first_item in enumerate(arguments):
  #       for second_index, second_item in enumerate(arguments):
  #         if (first_index != second_index):
  #           if check_type(first_item, second_item):
  #             pass
  #   else:
  #     return self


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

UnknownType = ClassDef('unknown')

core_variables = Variables({
  'Generic': TypeClassRef(ClassRef(GenericType)),
  'NoneType': ClassRef(NoneType),
  'Union': ClassRef(UnionType),

  'type': ClassRef(TypeType)
})


## Errors

@dataclass(kw_only=True)
class StaticAnalysisContext:
  input_value: LocatedString
  prelude: Variables

class StaticAnalysisError(Error):
  def __init__(self, message: str, node: ast.expr, context: StaticAnalysisContext):
    super().__init__(
      message,
      references=[ErrorDocumentReference.from_area(context.input_value.compute_ast_node_area(node))]
    )

  def analysis(self):
    return StaticAnalysisAnalysis(errors=[self])

T = TypeVar('T')
S = TypeVar('S')

@dataclass(kw_only=True)
class StaticAnalysisAnalysis:
  errors: list[StaticAnalysisError] = field(default_factory=list)

  def add(self, other: tuple[Self, T], /) -> T:
    other_analysis, other_value = other
    self += other_analysis

    return other_value

  def add_sequence(self, other: Sequence[tuple[Self, T]], /) -> list[T]:
    analysis, value = StaticAnalysisAnalysis.sequence(other)
    self += analysis

    return value

  def add_mapping(self, other: Mapping[T, tuple[Self, S]], /) -> dict[T, S]:
    output = dict[T, S]()

    for key, (item_analysis, value) in other.items():
      self += item_analysis
      output[key] = value

    return output

  def __add__(self, other: Self):
    return StaticAnalysisAnalysis(
      errors=(self.errors + other.errors)
    )

  def __iadd__(self, other: Self, /):
    self.errors += other.errors
    return self

  @classmethod
  def sequence(cls, obj: Sequence[tuple[Self, T]], /) -> tuple[Self, list[T]]:
    analysis = cls()
    output = list[T]()

    for item in obj:
      output.append(analysis.add(item))

    return analysis, output


## Utility functions

# TODO: Accept class generics here
def parse_type(node: ast.expr, /, variables: VariableOrTypeDefs, context: StaticAnalysisContext, *, resolve_types: bool = True):
  match node:
    case ast.BinOp(left=left, op=ast.BitOr(), right=right):
      analysis = StaticAnalysisAnalysis()

      left_type = analysis.add(parse_type(left, variables, context))
      right_type = analysis.add(parse_type(right, variables, context))

      return analysis, ClassRef(UnionType, arguments=[left_type, right_type])

    case ast.Constant(None):
      return StaticAnalysisAnalysis(), ClassRef(NoneType)

    case ast.Name(id=name, ctx=ast.Load()):
      value = variables.get(name)

      match value:
        case ClassDef() if (not resolve_types):
          return StaticAnalysisAnalysis(), ClassRef(value)
        case ClassRef() if (not resolve_types):
          return StaticAnalysisAnalysis(), value
        case TypeClassRef() if resolve_types:
          return StaticAnalysisAnalysis(), value.extract()
        # case ClassRef(cls) if resolve_types and (cls is TypeType):
        #   print(value)
        #   assert value.arguments is not None
        #   return value.arguments[cls.generics[0]]
        case TypeVarDef():
          return StaticAnalysisAnalysis(), value
        case None:
          return StaticAnalysisError("Invalid reference to missing value", node, context).analysis(), ClassRef(UnknownType)
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

      analysis = StaticAnalysisAnalysis()
      args = list[ClassRef | TypeVarDef]()

      for arg in expr_args:
        arg_value = analysis.add(parse_type(arg, variables, context))
        args.append(arg_value)

        if ref.cls is GenericType:
          assert isinstance(arg_value, TypeVarDef)
        else:
          assert isinstance(arg_value, (ClassRef, TypeVarDef))

      # TODO: Handle union types

      if ref.cls is GenericType:
        return analysis, TypeClassRef(
          GenericClassRef(ClassGenericsDef(
            before_tuple=cast(list[TypeVarDef], args)
          ))
        )

      new_ref = ClassRef(
        arguments={ typevar: arg for typevar, arg in zip(ref.cls.generics.before_tuple, cast(list[ClassRef], args)) },
        cls=ref.cls
      )

      return analysis, (new_ref if resolve_types else TypeClassRef(new_ref))

    case _:
      print("Missing", ast.dump(node, indent=2))
      raise Exception


def parse_func(node: ast.FunctionDef, /, variables: VariableOrTypeDefs, context: StaticAnalysisContext):
  analysis = StaticAnalysisAnalysis()

  def process_arg_type(annotation):
    return annotation and analysis.add(parse_type(annotation, variables, context))

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

  return analysis, FuncOverloadDef(
    args_posonly=args_pos,
    args_both=args_both,
    args_kwonly=args_kw,
    default_count=len(node.args.defaults),
    return_type=(node.returns and analysis.add(parse_type(node.returns, variables, context)))
  )


## Process module

def process_module(module: ast.Module, /, variables: VariableOrTypeDefs, context: StaticAnalysisContext):
  analysis = StaticAnalysisAnalysis()
  values = VariableOrTypeDefs()

  for module_statement in module.body:
    match module_statement:
      case ast.AnnAssign(target=ast.Name(id=name, ctx=ast.Store()), annotation=attr_ann, value=None, simple=1):
        assert not (name in values)
        result_type = analysis.add(parse_type(attr_ann, variables | values, context))

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
        values[name] = analysis.add(parse_type(value, variables | values, context, resolve_types=False))

      case ast.ClassDef(name=class_name, bases=class_bases, body=class_body):
        cls = ClassDef(class_name)
        generics_set = False

        for class_base in class_bases:
          base_type_ref = analysis.add(parse_type(class_base, variables | values, context, resolve_types=False))
          assert isinstance(base_type_ref, TypeClassRef)
          base_ref = base_type_ref.extract()

          if isinstance(base_ref, GenericClassRef):
            assert not generics_set
            cls.generics = base_ref.generics
            generics_set = True
          else:
            cls.bases.append(base_ref)

        values[class_name] = TypeClassRef(ClassRef(cls))

        init_func = FuncDef()
        cls.instance_attrs['__init__'] = ClassRef(init_func)

        for class_statement in class_body:
          match class_statement:
            case ast.AnnAssign(target=ast.Name(id=attr_name, ctx=ast.Store()), annotation=attr_ann, value=None, simple=1):
              if attr_name in cls.class_attrs:
                raise Exception("Duplicate class attribute")

              cls.class_attrs[attr_name] = analysis.add(parse_type(attr_ann, variables | values, context))

            case ast.AnnAssign(target=ast.Attribute(attr=attr_name, value=ast.Name(id='self')), annotation=attr_ann, simple=0):
              if attr_name in cls.instance_attrs:
                raise Exception("Duplicate instance attribute")

              cls.instance_attrs[attr_name] = analysis.add(parse_type(attr_ann, variables | values, context))

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
            return_type=ClassRef(NoneType)
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

  return analysis, Variables({ name: value for name, value in values.items() if not isinstance(value, TypeVarDef) })

def process_source(contents: str, /, variables):
  module = ast.parse(contents)
  # print(ast.dump(module, indent=2))

  document = Document.text(contents)
  context = StaticAnalysisContext(
    input_value=document.source,
    prelude=Variables()
  )

  analysis, result_variables = process_module(module, variables, context)

  for error in analysis.errors:
    print("Error :", error)
    print(error.references[0].area.format())

  return result_variables


## Evaluation checker

def resolve_generics(input_type: ClassRef | TypeVarDef, /, generics: dict[TypeVarDef, ClassRef]) -> tuple[StaticAnalysisAnalysis, ClassRef]:
  match input_type:
    case ClassRef(cls, arguments=args):
      return StaticAnalysisAnalysis(), ClassRef(cls, arguments=args)

    case TypeVarDef():
      return StaticAnalysisAnalysis(), generics[input_type]

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

def evaluate(node: ast.expr, /, variables: Variables, context: StaticAnalysisContext, *, generics: Optional[dict[TypeVarDef, ClassRef]] = None) -> tuple[StaticAnalysisAnalysis, ClassRef]:
  match node:
    case ast.Attribute(obj, attr=attr_name, ctx=ast.Load()):
      analysis, obj_type = evaluate(obj, variables, context)

      if obj_type.cls is UnknownType:
        return analysis, ClassRef(UnknownType)

      if isinstance(obj_type, TypeClassRef):
        obj_type = obj_type.extract()
      else:
        for class_ref in obj_type.mro():
          if attr := class_ref.cls.instance_attrs.get(attr_name):
            attr_type = attr.resolve(class_ref.arguments or dict())
            return analysis, attr_type

      for class_ref in obj_type.mro():
        if attr := class_ref.cls.class_attrs.get(attr_name):
          attr_type = attr.resolve(class_ref.arguments or dict())
          return analysis, attr_type

      return analysis + StaticAnalysisError("Invalid reference to missing attribute", node, context).analysis(), ClassRef(UnknownType)

    case ast.BinOp(left=left, right=right, op=op):
      analysis = StaticAnalysisAnalysis()

      left_type = analysis.add(evaluate(left, variables, context))
      right_type = analysis.add(evaluate(right, variables, context))

      operator_name = BinOpMethodMap[op.__class__]

      if (method := left_type.cls.instance_attrs.get(f"__{operator_name}__"))\
        and (overload := find_overload(method, args=[right_type], kwargs=dict())):
        return analysis, overload.return_type

      if (method := right_type.cls.instance_attrs.get(f"__r{operator_name}__"))\
        and (overload := find_overload(method, args=[left_type], kwargs=dict())):
        return analysis, overload.return_type

      if (left_type.cls is UnknownType) and (right_type.cls is UnknownType):
        return analysis, ClassRef(UnknownType)

      return (analysis + StaticAnalysisError("Invalid operation", node, context).analysis()), ClassRef(UnknownType)

    case ast.Call(obj, args, keywords):
      analysis, obj_ref = evaluate(obj, variables, context)

      if obj_ref.cls is UnknownType:
        return analysis, ClassRef(UnknownType)

      args = analysis.add_sequence([evaluate(arg, variables, context) for arg in args])
      kwargs = analysis.add_mapping({ keyword.arg: evaluate(keyword.value, variables, context) for keyword in keywords if keyword.arg })

      if isinstance(obj_ref, TypeClassRef):
        target = obj_ref.extract()

        overload = find_overload(target.cls.instance_attrs['__init__'], args=args, kwargs=kwargs)

        if not overload:
          analysis.errors.append(StaticAnalysisError("Invalid call", node, context))

        return analysis, target

      func_ref = obj_ref.cls.instance_attrs.get('__call__')

      if not func_ref:
        return analysis + StaticAnalysisError("Invalid object for call", node, context).analysis(), ClassRef(UnknownType)

      assert isinstance(func_ref.cls, FuncDef)
      overload = find_overload(func_ref.cls, args=args, kwargs=kwargs)

      assert overload
      return resolve_generics(overload.return_type, obj_ref.context) if overload.return_type else None

    case ast.Constant(builtins.float()):
      assert isinstance(const_type := context.prelude['float'], TypeClassRef)
      return StaticAnalysisAnalysis(), const_type.extract()

    case ast.Constant(builtins.int()):
      assert isinstance(const_type := context.prelude['int'], TypeClassRef)
      return StaticAnalysisAnalysis(), const_type.extract()

    # case ast.List(items, ctx=ast.Load()):
    #   analysis, item_types = StaticAnalysisAnalysis.sequence([evaluate(item, variables, context) for item in items])
    #   return analysis, ClassRef(UnionType, arguments=item_types)

    case ast.Name(id=name, ctx=ast.Load()):
      all_variables = context.prelude | variables

      if not (name in all_variables):
        return StaticAnalysisAnalysis(errors=[StaticAnalysisError("Invalid reference to missing variable", node, context)]), ClassRef(UnknownType)

      return StaticAnalysisAnalysis(), all_variables[name]

    case ast.Subscript(value, slice=subscript, ctx=ast.Load()):
      analysis = StaticAnalysisAnalysis()
      value_type = analysis.add(evaluate(value, variables, context))
      subscript_type = analysis.add(evaluate(subscript, variables, context))

      if isinstance(value_type, TypeClassRef) and isinstance(subscript_type, TypeClassRef):
        value_type_inner = value_type.extract()

        return analysis, TypeClassRef(ClassRef(
          value_type_inner.cls,
          arguments={ value_type_inner.cls.generics.before_tuple[0]: subscript_type.extract() }
        ))
      else:
        return (analysis + StaticAnalysisError("Invalid operation", node, context).analysis()), ClassRef(UnknownType)

    case _:
      print("Missing", ast.dump(node, indent=2))
      raise Exception

#
# Checks if lhs >= rhs (lhs at least contains rhs)
#
# Examples
#   class B(A) then B >= A
#   var: A = B() then B >= A
#   var: (X | Y) = X() then X >= (X | Y)
#
def check_type(lhs: ClassRef, rhs: ClassRef, /):
  if lhs.cls is UnionType:
    assert lhs.arguments
    return all(check_type(variant, rhs) for variant in lhs.arguments.values())

  if rhs.cls is UnionType:
    assert lhs.arguments
    return any(check_type(variant, rhs) for variant in lhs.arguments.values())

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

  prelude_variables = core_variables | process_source("""
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

T = TypeVar('T')

class list(Generic[T]):
  self.a: T
  def b(self) -> T: ...
""", core_variables)

  user_variables = process_source("""
T = TypeVar('T')

class A(Generic[T]):
  self.x: T

class B(Generic[T]):
  self.y: A[T]

  def foo(self) -> T: ...
""", prelude_variables)

  user_variables['devices'] = devices

  from pprint import pprint

  # print()
  # pprint(AuxVariables['A'].extract().cls.instance_attrs)
  # print()

  document = Document.text("~~~B[int]().foo~~~")
  context = StaticAnalysisContext(
    input_value=document.source[3:-3],
    prelude=prelude_variables
  )

  root = ast.parse(context.input_value, mode='eval')

  # print(ast.dump(root, indent=2))
  analysis, result = evaluate(root.body, user_variables, context)

  for error in analysis.errors:
    print("Error :", error)
    print(error.references[0].area.format())

  print()
  pprint(result)

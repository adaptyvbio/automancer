import ast
import builtins
from collections import ChainMap
import copy
from dataclasses import KW_ONLY, dataclass, field
from pprint import pprint
from types import EllipsisType, GenericAlias
from typing import Any, Generator, Generic, Literal, Mapping, Optional, Protocol, Self, Sequence, TypeVar, cast

from ..analysis import DiagnosticAnalysis
from ..document import Document
from ..error import Diagnostic, Error, ErrorDocumentReference, ErrorReference
from ..reader import LocatedString, Source


## Type system

TypeT = TypeVar('TypeT')

@dataclass
class TypeVarDef:
  name: str

  def resolve(self, type_variables: 'TypeVariables'):
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

  def resolve(self, type_variables: 'TypeVariables'):
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
  bases: 'list[OuterType]' = field(default_factory=list)
  generics: ClassGenericsDef = field(default_factory=ClassGenericsDef)
  class_attrs: 'dict[str, OuterType]' = field(default_factory=dict)
  instance_attrs: 'dict[str, InnerType]' = field(default_factory=dict)

  def resolve(self, type_variables: 'TypeVariables'):
    return self
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

  def analyze_access(self):
    return StaticAnalysisAnalysis()

  def mro(self) -> 'Generator[OuterType, None, None]':
    yield cast(OuterType, self)

    for base_ref in self.cls.bases:
      for mro_ref in base_ref.mro():
        yield mro_ref

  def resolve(self, type_variables: 'TypeVariables'):
    result = copy.copy(cast(OuterType, self))
    result.arguments = { key: arg.resolve(type_variables) for key, arg in self.arguments.items() } if self.arguments is not None else dict()

    return result

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

class TypeClassRef(ClassRef[TypeT], Generic[TypeT]):
  def __init__(self, ref: TypeT, /):
    super().__init__(TypeType, arguments={ TypeType.generics.before_tuple[0]: ref })

  def extract(self):
    assert self.arguments is not None
    return self.arguments[TypeType.generics.before_tuple[0]]


## Builtins types & core variables

InnerType = ClassRef['InnerType'] | TypeVarDef
OuterType = ClassRef['InnerType']

TypeVariables = dict[TypeVarDef, OuterType]
Variables = dict[str, OuterType]
VariableOrTypeDefs = dict[str, OuterType | TypeVarDef]

FunctionType = ClassDef('function')
MethodType = ClassDef('method')
NoneType = ClassDef('None')
UnionType = ClassDef('Union')

UnknownType = ClassDef('unknown')

CoreVariables = Variables({
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

class StaticAnalysisDiagnostic(Diagnostic):
  def __init__(self, message: str, node: ast.expr | ast.stmt, context: StaticAnalysisContext, *, name: str = 'unknown'):
    super().__init__(
      message,
      name=('staticanalysis.' + name),
      references=[ErrorDocumentReference.from_area(context.input_value.compute_ast_node_area(node))]
    )

  def analysis(self, *, warning: bool = False):
    return StaticAnalysisAnalysis(warnings=[self]) if warning else StaticAnalysisAnalysis(errors=[self])

class StaticAnalysisMetadata(Protocol):
  def __or__(self, other: Self, /) -> Self:
    ...

def unite_metadata(a: 'Optional[StaticAnalysisMetadata]', b: 'Optional[StaticAnalysisMetadata]'):
  match a, b:
    case _, None:
      return cast(StaticAnalysisMetadata, a)
    case None, _:
      return cast(StaticAnalysisMetadata, b)
    case _, _:
      return cast(StaticAnalysisMetadata, a | b) # type: ignore

@dataclass(kw_only=True)
class StaticAnalysisAnalysis(DiagnosticAnalysis):
  metadata: dict[str, StaticAnalysisMetadata] = field(default_factory=dict)

  def __iadd__(self, other: Self, /):
    self.metadata = {
      key: unite_metadata(self.metadata.get(key), other.metadata.get(key))
        for key in {*self.metadata.keys(), *other.metadata.keys()}
    }

    return super().__iadd__(other)


## Utility functions

# TODO: Accept class generics here
def parse_type(node: ast.expr, /, variables: VariableOrTypeDefs, context: StaticAnalysisContext, *, instantiate_types: bool = True) -> tuple[StaticAnalysisAnalysis, InnerType]:
  match node:
    # case ast.BinOp(left=left, op=ast.BitOr(), right=right):
    #   analysis = StaticAnalysisAnalysis()

    #   left_type = analysis.add(parse_type(left, variables, context))
    #   right_type = analysis.add(parse_type(right, variables, context))

    #   return analysis, ClassRef(UnionType, arguments=[left_type, right_type])

    case ast.Constant(None):
      return StaticAnalysisAnalysis(), ClassRef(NoneType)

    case ast.Name(id=name, ctx=ast.Load()):
      value = variables.get(name)

      match value:
        case ClassDef() if (not instantiate_types):
          return StaticAnalysisAnalysis(), ClassRef(value)
        case ClassRef() if (not instantiate_types):
          return StaticAnalysisAnalysis(), value
        case TypeClassRef() if instantiate_types:
          return StaticAnalysisAnalysis(), value.extract()
        # case ClassRef(cls) if resolve_types and (cls is TypeType):
        #   print(value)
        #   assert value.arguments is not None
        #   return value.arguments[cls.generics[0]]
        case TypeVarDef():
          return StaticAnalysisAnalysis(), value
        case None:
          return StaticAnalysisDiagnostic("Invalid reference to missing symbol", node, context, name='missing_symbol').analysis(), ClassRef(UnknownType)
        case _:
          raise Exception

    case ast.Subscript(value=ast.Name(id=name, ctx=ast.Load()), slice=subscript, ctx=ast.Load()):
      type_ref = variables[name]

      if not isinstance(type_ref, TypeClassRef):
        return StaticAnalysisDiagnostic("Invalid subscript operation", node, context, name='invalid_subscript').analysis(), ClassRef(UnknownType)

      ref = cast(TypeClassRef[OuterType], type_ref.extract())

      assert ref.arguments is None

      match subscript:
        case ast.Tuple(subscript_args, ctx=ast.Load()):
          expr_args = subscript_args
        case _:
          expr_args = [subscript]

      analysis = StaticAnalysisAnalysis()
      args = list[InnerType]()

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

      new_ref = ClassRef[InnerType](
        arguments={ typevar: arg for typevar, arg in zip(ref.cls.generics.before_tuple, cast(list[ClassRef], args)) },
        cls=ref.cls
      )

      return analysis, (new_ref if instantiate_types else TypeClassRef(new_ref))

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
        values[name] = analysis.add(parse_type(value, variables | values, context, instantiate_types=False))

      case ast.ClassDef(name=class_name, bases=class_bases, body=class_body):
        cls = ClassDef(class_name)
        generics_set = False

        for class_base in class_bases:
          base_type_ref = analysis.add(parse_type(class_base, variables | values, context, instantiate_types=False))

          if not isinstance(base_type_ref, TypeClassRef):
            analysis.errors.append(StaticAnalysisDiagnostic("Invalid base value", module_statement, context, name='invalid_base'))
            continue

          base_ref = cast(ClassRef[InnerType], base_type_ref.extract())

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

def evaluate_expr_type(node: ast.expr, /, variables: Variables, context: StaticAnalysisContext, *, generics: Optional[dict[TypeVarDef, ClassRef]] = None) -> tuple[StaticAnalysisAnalysis, OuterType]:
  match node:
    case ast.Attribute(obj, attr=attr_name, ctx=ast.Load()):
      analysis, obj_type = evaluate_expr_type(obj, variables, context)

      if obj_type.cls is UnknownType:
        return analysis, ClassRef(UnknownType)

      if isinstance(obj_type, TypeClassRef):
        obj_type = cast(OuterType, obj_type.extract())
      else:
        for class_ref in obj_type.mro():
          if attr := class_ref.cls.instance_attrs.get(attr_name):
            attr_type = attr.resolve(class_ref.arguments or dict())
            analysis += attr_type.analyze_access()
            return analysis, attr_type

      for class_ref in obj_type.mro():
        if attr := class_ref.cls.class_attrs.get(attr_name):
          attr_type = attr.resolve(class_ref.arguments or dict())
          return analysis, attr_type

      return analysis + StaticAnalysisDiagnostic("Invalid reference to missing attribute", node, context).analysis(), ClassRef(UnknownType)

    case ast.BinOp(left=left, right=right, op=op):
      analysis = StaticAnalysisAnalysis()

      left_type = analysis.add(evaluate_expr_type(left, variables, context))
      right_type = analysis.add(evaluate_expr_type(right, variables, context))

      operator_name = BinOpMethodMap[op.__class__]

      for left_ref in left_type.mro():
        if (method := left_ref.cls.instance_attrs.get(f"__{operator_name}__"))\
          and (overload := find_overload(method, args=[right_type], kwargs=dict())):
          return analysis, overload.return_type

      for right_ref in right_type.mro():
        if (method := right_ref.cls.instance_attrs.get(f"__r{operator_name}__"))\
          and (overload := find_overload(method, args=[left_type], kwargs=dict())):
          return analysis, overload.return_type

      if (left_type.cls is UnknownType) and (right_type.cls is UnknownType):
        return analysis, ClassRef(UnknownType)

      return (analysis + StaticAnalysisDiagnostic("Invalid operation", node, context).analysis(warning=True)), ClassRef(UnknownType)

    case ast.Call(obj, args, keywords):
      analysis, obj_ref = evaluate_expr_type(obj, variables, context)

      if obj_ref.cls is UnknownType:
        return analysis, ClassRef(UnknownType)

      args = analysis.add_sequence([evaluate_expr_type(arg, variables, context) for arg in args])
      kwargs = analysis.add_mapping({ keyword.arg: evaluate_expr_type(keyword.value, variables, context) for keyword in keywords if keyword.arg })

      if isinstance(obj_ref, TypeClassRef):
        target = obj_ref.extract()

        overload = find_overload(target.cls.instance_attrs['__init__'], args=args, kwargs=kwargs)

        if not overload:
          analysis.errors.append(StaticAnalysisDiagnostic("Invalid call", node, context))

        return analysis, target

      func_ref = obj_ref.cls.instance_attrs.get('__call__')

      if not func_ref:
        return analysis + StaticAnalysisDiagnostic("Invalid object for call", node, context).analysis(), ClassRef(UnknownType)

      assert isinstance(func_ref.cls, FuncDef)
      overload = find_overload(func_ref.cls, args=args, kwargs=kwargs)

      assert overload
      return resolve_generics(overload.return_type, obj_ref.context) if overload.return_type else None

    case ast.Compare(left=left, ops=ops, comparators=comparators):
      analysis = StaticAnalysisAnalysis()
      left_type = analysis.add(evaluate_expr_type(left, variables, context))
      comparators_type = analysis.add_sequence([evaluate_expr_type(comparator, variables, context) for comparator in comparators])

      # TODO: Add implementation here

      return analysis, cast(TypeClassRef[OuterType], context.prelude['bool']).extract()

    case ast.Constant(builtins.float()):
      return StaticAnalysisAnalysis(), cast(TypeClassRef[OuterType], context.prelude['float']).extract()

    case ast.Constant(builtins.int()):
      return StaticAnalysisAnalysis(), cast(TypeClassRef[OuterType], context.prelude['int']).extract()

    case ast.Constant(builtins.str()):
      return StaticAnalysisAnalysis(), cast(TypeClassRef[OuterType], context.prelude['str']).extract()

    # case ast.List(items, ctx=ast.Load()):
    #   analysis, item_types = StaticAnalysisAnalysis.sequence([evaluate(item, variables, context) for item in items])
    #   return analysis, ClassRef(UnionType, arguments=item_types)

    case ast.Name(id=name, ctx=ast.Load()):
      all_variables = context.prelude | variables

      if not (name in all_variables):
        return StaticAnalysisAnalysis(errors=[StaticAnalysisDiagnostic("Invalid reference to missing variable", node, context)]), ClassRef(UnknownType)

      return StaticAnalysisAnalysis(), all_variables[name]

    case ast.Subscript(value, slice=subscript, ctx=ast.Load()):
      analysis = StaticAnalysisAnalysis()
      value_type = analysis.add(evaluate_expr_type(value, variables, context))
      subscript_type = analysis.add(evaluate_expr_type(subscript, variables, context))

      if isinstance(value_type, TypeClassRef) and isinstance(subscript_type, TypeClassRef):
        value_type_inner = value_type.extract()

        return analysis, TypeClassRef(ClassRef(
          value_type_inner.cls,
          arguments={ value_type_inner.cls.generics.before_tuple[0]: subscript_type.extract() }
        ))
      else:
        return (analysis + StaticAnalysisDiagnostic("Invalid operation", node, context).analysis(warning=True)), ClassRef(UnknownType)

    case _:
      print("Missing", ast.dump(node, indent=2))
      return StaticAnalysisDiagnostic("Unimplemented operation", node, context, name='unimplemented_operation').analysis(warning=True), ClassRef(UnknownType)

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

  for base in lhs.mro():
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


# Prelude

PreludeVariables = CoreVariables | process_source("""
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

class bool(int):
  pass

T = TypeVar('T')

# class list(Generic[T]):
#   self.a: T
#   def b(self) -> T: ...
""", CoreVariables)

CommonVariables = {
  'bool': cast(TypeClassRef[OuterType], PreludeVariables['bool']).extract().cls,
  'float': cast(TypeClassRef[OuterType], PreludeVariables['float']).extract().cls,
  'int': cast(TypeClassRef[OuterType], PreludeVariables['int']).extract().cls,
  'unknown': UnknownType
}


## Tests

if __name__ == "__main__":
  # tree = ast.parse("((y := 1.0) if x[0+1] else (y := 5.0)) + y", mode='eval').body
  # stack = {
  #   'devices': dict[str, int],
  #   'x': list[bool]
  # }

  user_variables = process_source("""
T = TypeVar('T')

class A(Generic[T]):
  self.x: T

class B(Generic[T]):
  self.y: A[T]

  def foo(self) -> T: ...
""", PreludeVariables)

  DeviceDependenciesMetadata = set[tuple[str, ...]]

  class TrackedClassRef(ClassRef):
    def __init__(self, path: tuple[str, ...]):
      super().__init__(PreludeVariables['float'].extract().cls)
      self.path = path

    def analyze_access(self):
      return StaticAnalysisAnalysis(metadata={
        'devices': DeviceDependenciesMetadata({self.path})
      })

  devices = ClassRef(ClassDef(
    name='Devices',
    instance_attrs={
      'Okolab': ClassRef(ClassDef(
        name='OkolabDevice',
        instance_attrs={
          'pressure': TrackedClassRef(('Okolab', 'pressure')),
          'temperature': TrackedClassRef(('Okolab', 'temperature'))
        }
      ))
    }
  ))

  user_variables['devices'] = devices

  # print()
  # pprint(AuxVariables['A'].extract().cls.instance_attrs)
  # print()

  document = Document.text("~~~ devices.Okolab.temperature > (3.0 * ureg.degC) ~~~")
  context = StaticAnalysisContext(
    input_value=document.source[4:-4],
    prelude=PreludeVariables
  )

  root = ast.parse(context.input_value, mode='eval')

  # print(ast.dump(root, indent=2))
  analysis, result = evaluate_expr_type(root.body, user_variables, context)

  for error in analysis.errors:
    print("Error :", error)
    print(error.references[0].area.format())

  print('---')
  pprint(result)

  print()
  pprint(analysis)

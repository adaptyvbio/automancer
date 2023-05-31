from dataclasses import KW_ONLY, dataclass, field
from typing import Any, Generator, Generic, Mapping, Optional, Sequence, TypeVar, TypedDict


# Type variables

@dataclass
class TypeVarDef:
  name: str

  def __hash__(self):
    return id(self)

  def __repr__(self):
    return f"<{self.__class__.__name__} {self.name}>"


OrderedTypeVariables = list[TypeVarDef]
TypeVariables = set[TypeVarDef]
TypeValues = dict[TypeVarDef, 'TypeDef']


# Classes

@dataclass
class ClassDef:
  name: str
  _: KW_ONLY
  bases: 'list[ClassDefWithTypeArgs]' = field(default_factory=list)
  class_attrs: 'TypeDefs' = field(default_factory=dict)
  instance_attrs: 'TypeDefs' = field(default_factory=dict)
  type_variables: OrderedTypeVariables = field(default_factory=list)

  def __repr__(self):
    type_variables = [typevar.name for typevar in self.type_variables]
    return f"<{self.__class__.__name__} {self.name}" + (f"[{', '.join(type_variables)}]" if type_variables else str()) + ">"


# Functions

@dataclass(kw_only=True)
class FuncArgDef:
  name: str
  type: 'Optional[TypeDef]'

@dataclass(kw_only=True)
class FuncKwArgDef(FuncArgDef):
  has_default: bool

@dataclass(kw_only=True)
class FuncOverloadDef:
  args_posonly: list[FuncArgDef]
  args_both: list[FuncArgDef]
  args_kwonly: list[FuncKwArgDef]
  default_count: int
  return_type: 'TypeDef'

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
class FuncDef(ClassDef):
  name: str = 'function'
  overloads: list[FuncOverloadDef] = field(default_factory=list)

  def __post_init__(self):
    self.instance_attrs={ '__call__': self }

  def __repr__(self):
    overloads = [repr(overload) for overload in self.overloads]
    return f"<{self.__class__.__name__} " + ", ".join(overloads) + ">"


# Misc

T = TypeVar('T')

@dataclass
class UnionDef(Generic[T]):
  left: T
  right: T

  def __repr__(self):
    return f"<{self.__class__.__name__} {self.left!r} | {self.right!r}>"

  @classmethod
  def iter(cls, item: T, /) -> 'Generator[T, None, None]':
    if isinstance(item, UnionDef):
      yield from cls.iter(item.left)
      yield from cls.iter(item.right)
    else:
      yield item

  @classmethod
  def from_iter(cls, items_iter: Sequence[T], /):
    from .overloads import check_type

    items = list[T]()

    for item in items_iter:
      if not any(check_type(item, other) for other in items):
        items.append(item)

    if len(items) == 1:
      return items[0]

    union = cls(items[0], items[1])

    for item in items[2:]:
      union = cls(union, item)

    return union

@dataclass
class UnknownDef:
  pass

@dataclass
class ClassConstructorDef(Generic[T]):
  target: T

@dataclass
class ClassDefWithTypeArgs:
  cls: ClassDef
  type_args: 'list[TypeDef]' = field(default_factory=list)

  @property
  def type_values(self) -> TypeValues:
    return { type_variable: type_arg for type_variable, type_arg in zip(self.cls.type_variables, self.type_args) }


# Complex types

KnownTypeDef = ClassDef | ClassDefWithTypeArgs | ClassConstructorDef['TypeDef'] | TypeVarDef | UnionDef['TypeDef']
TypeDef = KnownTypeDef | UnknownDef
TypeDefs = dict[str, TypeDef]

ExportedKnownTypeDef = ClassDef | ClassDefWithTypeArgs | ClassConstructorDef['ExportedKnownTypeDef'] | UnionDef['ExportedTypeDef']
ExportedTypeDef = ExportedKnownTypeDef | UnknownDef
ExportedTypeDefs = dict[str, ExportedTypeDef]


KnownTypeInstance = ClassDefWithTypeArgs | ClassConstructorDef[ClassDefWithTypeArgs | ClassDef] | UnionDef['TypeInstance']
TypeInstance = KnownTypeInstance | UnknownDef
TypeInstances = dict[str, TypeInstance]


Symbols = tuple[ExportedTypeDefs, TypeInstances]


# Prelude

class PreludeTypeDefs(TypedDict):
  float: ClassDef
  int: ClassDef
  list: ClassDef
  slice: ClassDef
  str: ClassDef

class PreludeTypeInstances(TypedDict):
  float: ClassDefWithTypeArgs
  int: ClassDefWithTypeArgs
  list: ClassDef

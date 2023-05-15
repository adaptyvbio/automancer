from dataclasses import KW_ONLY, dataclass, field
from typing import Optional


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
  return_type: 'Optional[TypeDef]'

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

@dataclass
class UnionDef:
  left: 'TypeDef'
  right: 'TypeDef'

  def __repr__(self):
    return f"<{self.__class__.__name__} {self.left!r} | {self.right!r}>"

@dataclass
class UnknownType:
  pass

@dataclass
class UnknownDef:
  pass

@dataclass
class ClassConstructorDef:
  target: 'TypeDef'

@dataclass
class ClassDefWithTypeArgs:
  cls: ClassDef
  type_args: 'list[TypeDef]' # = field(default_factory=list)

  @property
  def type_values(self) -> TypeValues:
    return { type_variable: type_arg for type_variable, type_arg in zip(self.cls.type_variables, self.type_args) }


# Complex types

TypeDef = ClassDef | ClassDefWithTypeArgs | ClassConstructorDef | TypeVarDef | UnionDef | UnknownDef
TypeDefs = dict[str, TypeDef]

TypeInstance = ClassDef | ClassDefWithTypeArgs | ClassConstructorDef | UnionDef | UnknownDef
TypeInstances = dict[str, TypeInstance]

from dataclasses import KW_ONLY, dataclass, field


# Type variables

@dataclass
class TypeVarDef:
  name: str

  def __hash__(self):
    return id(self)

  def __repr__(self):
    return f"<{self.__class__.__name__} {self.name}>"

@dataclass
class GenericClassDefWithGenerics:
  type_variables: list[TypeVarDef]

TypeVariables = set[TypeVarDef]
TypeValues = dict[TypeVarDef, 'AnyType']


# Classes

@dataclass
class ClassDef:
  name: str
  _: KW_ONLY
  bases: 'list[InstantiableClassDef]' = field(default_factory=list)
  class_attrs: 'dict[str, AnyType]' = field(default_factory=dict)
  instance_attrs: 'dict[str, AnyType]' = field(default_factory=dict)
  type_variables: list[TypeVarDef] = field(default_factory=list)

  def __repr__(self):
    type_variables = [typevar.name for typevar in self.type_variables]
    return f"<{self.__class__.__name__} {self.name}" + (f"[{', '.join(type_variables)}]" if type_variables else str()) + ">"


# Functions

@dataclass(kw_only=True)
class FuncArgDef:
  name: str
  type: 'AnyType'

@dataclass(kw_only=True)
class FuncKwArgDef(FuncArgDef):
  has_default: bool

@dataclass(kw_only=True)
class FuncOverloadDef:
  args_posonly: list[FuncArgDef]
  args_both: list[FuncArgDef]
  args_kwonly: list[FuncKwArgDef]
  default_count: int
  return_type: 'AnyType'

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


# Instances

@dataclass
class InstantiableClassDef:
  cls: ClassDef
  _: KW_ONLY
  type_args: 'list[InstantiableType]' = field(default_factory=list)

  @property
  def type_values(self) -> TypeValues:
    return { type_variable: type_arg for type_variable, type_arg in zip(self.cls.type_variables, self.type_args) }

@dataclass
class Instance:
  origin: InstantiableClassDef | TypeVarDef


# Misc

AnyType = Instance | InstantiableClassDef | ClassDef | TypeVarDef
# InstancerType = InstantiableClassDef | ClassDef | TypeVarDef
InstantiableType = InstantiableClassDef | TypeVarDef
Variables = dict[str, AnyType]

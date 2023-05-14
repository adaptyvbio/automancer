from dataclasses import dataclass

from .types import ClassDef, Instance, InstantiableClassDef, TypeVarDef


TypeVarClassDef = ClassDef('TypeVar')
GenericClassDef = ClassDef('Generic')

FunctionType = ClassDef('function')
MethodType = ClassDef('method')
NoneType = ClassDef('None')
UnionType = ClassDef('Union')

UnknownType = ClassDef('_unknown')


CoreVariables = {
  'Generic': GenericClassDef,
  'None': Instance(InstantiableClassDef(NoneType)),
  'NoneType': NoneType,
  'Union': UnionType,
  'TypeVar': TypeVarClassDef
}

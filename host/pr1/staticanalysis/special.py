from dataclasses import dataclass

from .types import ClassDef, Instance, InstantiableClassDef, TypeDefs, TypeVarDef


TypeVarClassDef = ClassDef('TypeVar')
GenericClassDef = ClassDef('Generic')

FunctionType = ClassDef('function')
MethodType = ClassDef('method')
NoneType = ClassDef('None')
TypeType = ClassDef('type')


CoreTypeDefs: TypeDefs = {
  'Generic': GenericClassDef,
  'None': NoneType,
  'NoneType': NoneType,
  'TypeVar': TypeVarClassDef,
  'type': TypeType
}

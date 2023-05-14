from dataclasses import dataclass

from .types import ClassDef, Instance, InstantiableClassDef, TypeVarDef


TypeVarClassDef = ClassDef('TypeVar')
GenericClassDef = ClassDef('Generic')

FunctionType = ClassDef('function')
MethodType = ClassDef('method')
NoneType = ClassDef('None')


CoreVariables = {
  'Generic': GenericClassDef,
  'None': Instance(InstantiableClassDef(NoneType)),
  'NoneType': NoneType,
  'TypeVar': TypeVarClassDef
}

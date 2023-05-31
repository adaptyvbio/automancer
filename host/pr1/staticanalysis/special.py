from dataclasses import dataclass

from .types import ClassDef, ExportedTypeDefs


TypeVarClassDef = ClassDef('TypeVar')
GenericClassDef = ClassDef('Generic')

FunctionType = ClassDef('function')
MethodType = ClassDef('method')
NoneType = ClassDef('None')
TypeType = ClassDef('type')


CoreTypeDefs: ExportedTypeDefs = {
  'Generic': GenericClassDef,
  'None': NoneType,
  'NoneType': NoneType,
  'TypeVar': TypeVarClassDef,
  'type': TypeType
}

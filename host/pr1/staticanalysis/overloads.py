from typing import Any, Optional

from .types import ClassDefWithTypeArgs, FuncDef, TypeDef, TypeInstance, TypeValues


#
# Checks if lhs >= rhs (lhs at least contains rhs)
#
# Examples
#   class B(A) then B >= A
#   var: A = B() then B >= A
#   var: (X | Y) = X() then X >= (X | Y)
#
def check_type(lhs: TypeDef, rhs: TypeDef, /):
  # if lhs.cls is UnionType:
  #   assert lhs.arguments
  #   return all(check_type(variant, rhs) for variant in lhs.arguments.values())

  # if rhs.cls is UnionType:
  #   assert lhs.arguments
  #   return any(check_type(variant, rhs) for variant in lhs.arguments.values())

  # for base in lhs.mro():
  #   if base.cls is rhs.cls:
  #     return True

  match lhs, rhs:
    case ClassDefWithTypeArgs(lhs_cls, lhs_type_args), ClassDefWithTypeArgs(rhs_cls, rhs_type_args):
      return (lhs_cls is rhs_cls) and (len(lhs_type_args) == len(rhs_type_args)) and all(check_type(lhs_type_arg, rhs_type_arg) for lhs_type_arg, rhs_type_arg in zip(lhs_type_args, rhs_type_args))

  print("!!", lhs, rhs)

  return False

def find_overload(func: FuncDef, /, args: list[TypeDef], kwargs: dict[str, TypeDef], type_values: TypeValues):
  from .expression import resolve_type_variables

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

      if (arg.type is not None) and (not check_type(input_arg, resolve_type_variables(arg.type, type_values))):
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

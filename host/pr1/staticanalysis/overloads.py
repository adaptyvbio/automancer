from typing import Any, Optional
from .types import AnyType, ClassDef, FuncDef, TypeValues, TypeVarDef


def find_overload(func: FuncDef, /, args: list[AnyType], kwargs: dict[str, AnyType], *, type_values: Optional[TypeValues] = None):
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

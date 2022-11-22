import ast
import builtins
from collections import ChainMap
from types import GenericAlias
from typing import Any

from .langservice import Analysis


class MissingType():
  pass

class Types():
  MissingType = MissingType

types = Types()

class InvalidOp():
  pass

def simplify(src: Any):
  return MissingType if issubclass(MissingType, src) else src

def analyze(expr: ast.expr, stack: ChainMap) -> tuple[Analysis, Any, set[str]]:
  match expr:
    case ast.BinOp():
      left_analysis, left_type, left_deps = analyze(expr.left, stack=stack)
      right_analysis, right_type, right_deps = analyze(expr.right, stack=stack)
      analysis = left_analysis + right_analysis
      deps = left_deps | right_deps

      match left_type, right_type:
        case builtins.int, builtins.int:
          return analysis, builtins.int, deps
        case builtins.float | builtins.int, builtins.float | builtins.int:
          return analysis, builtins.float, deps

        case (types.MissingType, _) | (_, types.MissingType):
          return analysis, types.MissingType, deps
        case _:
          print("Invalid", ast.unparse(expr))
          print(left_type, right_type)

          analysis.errors.append(InvalidOp())
          return analysis, types.MissingType, deps

    case ast.Constant(value):
      return Analysis(), type(value), set()

    case ast.IfExp(test, body, orelse):
      test_analysis, test_type, test_deps = analyze(test, stack=stack)

      if_stack = stack.copy()
      else_stack = stack.copy()

      if_analysis, if_type, if_deps = analyze(body, stack=if_stack)
      else_analysis, else_type, else_deps = analyze(orelse, stack=else_stack)

      for name, if_type in if_stack.maps[0].items():
        if name in (else_map := else_stack.maps[0]):
          stack[name] = if_type | else_map[name]

      analysis = if_analysis + else_analysis + test_analysis
      deps = if_deps | else_deps | test_deps

      if test_type != bool:
        analysis.errors.append(InvalidOp())

      return analysis, simplify(if_type | else_type), deps

    case ast.Name(ctx=ast.Load(), id=name):
      if name in stack:
        return Analysis(), stack[name], ({name} if name in stack.maps[-1] else set())
      else:
        return Analysis(errors=[NameError(name)]), MissingType, set()

    case ast.NamedExpr(target=ast.Name(ctx=ast.Store(), id=name), value=value):
      value_analysis, value_type, value_deps = analyze(value, stack=stack)
      stack[name] = value_type
      return value_analysis, value_type, value_deps

    case ast.Subscript(value, slice, ctx=ast.Load()):
      value_analysis, value_type, value_deps = analyze(value, stack=stack)
      slice_analysis, slice_type, slice_deps = analyze(slice, stack=stack)

      analysis = value_analysis + slice_analysis
      deps = value_deps | slice_deps

      match value_type, slice:
        case GenericAlias(__origin__=builtins.tuple, __args__=args), ast.Constant(value=int(index)):
          return analysis, args[index], value_deps
        case GenericAlias(__origin__=builtins.tuple, __args__=args), _:
          output_type = args[0]

          for arg in args[1:]:
            output_type |= arg

          if slice_type != builtins.int:
            analysis.errors.append(IndexError())

          return analysis, output_type, deps
        case GenericAlias(__origin__=builtins.list, __args__=(arg,)), _:
          return analysis, arg, deps

    case ast.Tuple(elts, ctx=ast.Load()):
      analysis = Analysis()
      values = list()
      deps = set()

      for elt in elts:
        elt_analysis, elt_value, elt_deps = analyze(elt, stack=stack)
        analysis += elt_analysis
        values.append(elt_value)
        deps |= elt_deps

      return analysis, GenericAlias(tuple, tuple(values)), deps

    case _:
      print("Unknown", expr)
      raise Exception()


if __name__ == "__main__":
  tree = ast.parse("((y := 1.0) if x[0+1] else (y := 5.0)) + y", mode='eval').body
  print(analyze(tree, stack=ChainMap({}, { 'x': list[bool] })))


# see: typing.get_type_hints

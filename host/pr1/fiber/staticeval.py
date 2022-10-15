import ast
import builtins
import math

from .. import reader as reader
from ..reader import LocatedString, LocatedValue, LocationArea, LocationRange, Source


class EvaluationError(Exception):
  def __init__(self, area, /):
    self.area = area

class InvalidCall(EvaluationError):
  pass

class InvalidNode(EvaluationError):
  pass


class EvaluationContext: # or Environment?
  def __init__(self, variables):
    # allow dynamic evaluation
    self.variables = variables

def evaluate(expr, /, source, context):
  area = LocationArea([LocationRange.from_ast_node(expr, source)])

  match expr:
    case ast.BinOp():
      left = evaluate(expr.left, source, context)
      right = evaluate(expr.right, source, context)

      match expr.op:
        case ast.Add():
          return LocatedValue.new(left.value + right.value, area)
        case ast.Mult():
          return LocatedValue.new(left.value * right.value, area)
        case ast.Sub():
          return left - right
        case _:
          raise InvalidNode(area)

    case ast.Call(args=args, func=ast.Name(ctx=ast.Load(), id=func_name), keywords=kwargs):
      match func_name, args, kwargs:
        case "abs", [arg], []:
          return LocatedValue.new(abs(evaluate(arg, source, context).value), area)
        case "cos", [arg], []:
          return LocatedValue.new(math.cos(evaluate(arg, source, context).value), area)
        case _:
          raise InvalidCall(area)

    case ast.Constant(value=value):
      return LocatedValue.new(value, area)

    case ast.Dict(keys=keys, values=values):
      return LocatedValue.new({
        evaluate(key, source, context): evaluate(value, source, context) for key, value in zip(keys, values)
      }, area)

    case ast.List(ctx=ast.Load(), elts=items):
      return LocatedValue.new([
        evaluate(item, source, context) for item in items
      ], area)

    case ast.Name(ctx=ast.Load(), id=name) if name in context.variables:
      return LocatedValue.new(context.variables[name], area)

    case ast.Subscript(ctx=ast.Load(), slice=slice, value=value):
      # Re-locating the result in case we are indexing a string, which will generate a non-located string.
      return LocatedValue.new(evaluate(value, source, context).value[evaluate(slice, source, context).value], area)

    case ast.UnaryOp(op=ast.USub(), operand=operand):
      return LocatedValue.new(-evaluate(operand, source, context).value, area)

    case _:
      raise InvalidNode(area)


if __name__ == "__main__":
  # text = '123 + 0x24 + abs(5 * 6)'
  # TODO: fix errors with zero-length range
  text = 'abs(-5.4 * (x[2 + 1]) + 1)'
  text = '{"a": "b"+"c"[0] + e, "B": 34+cos(2)*.5, "C": [1, -2, foo]}'
  source = Source(text)

  try:
    tree = ast.parse(text, mode='eval')
  except SyntaxError as e:
    s = LocatedString.from_syntax_error(e, source)
    print(s.area.format())
    print(e)
  else:
    print(ast.dump(tree, indent=2))
    # print(evaluate(tree.body, context=EvaluationContext(
    #   variables={
    #     'x': [0, 1, 2, 3]
    #   }
    # )))

    try:
      x = evaluate(tree.body, context=EvaluationContext(variables=dict(foo=3)), source=source)
    except EvaluationError as e:
      print("Error: " + type(e).__name__)
      print(e.area.format())
    else:
      print(x)
      print(x.get_key('a').area.format())
      print(x.value['a'].area.format())
      print(x.value['B'].area.format())
      print(x.value['C'][1].area.format())
      print(x.value['C'][2].area.format())

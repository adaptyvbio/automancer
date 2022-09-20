import ast
import math

from .. import reader as reader


class EvaluationContext:
  def __init__(self, variables):
    self.variables = variables

def evaluate(expr, context):
  match expr:
    case ast.BinOp():
      left = evaluate(expr.left, context)
      right = evaluate(expr.right, context)

      match expr.op:
        case ast.Add():
          return left + right
        case ast.Mult():
          return left * right
        case ast.Sub():
          return left - right
        case _:
          str = reader.LocatedString.from_ast_node(expr, source)
          print(str.area.format())

          raise Exception()

    case ast.Call(args=args, func=ast.Name(ctx=ast.Load(), id=func_name), keywords=kwargs):
      match func_name, args, kwargs:
        case "abs", [arg], []:
          return abs(evaluate(arg, context))
        case "cos", [arg], []:
          return math.cos(evaluate(arg, context))
        case _:
          raise Exception()

    case ast.Constant():
      return expr.value

    case ast.Name(ctx=ast.Load(), id=name) if name in context.variables:
      return context.variables[name]

    case ast.Subscript(ctx=ast.Load(), slice=slice, value=value):
      return evaluate(value, context)[evaluate(slice, context)]

    case ast.UnaryOp(op=ast.USub(), operand=operand):
      return -evaluate(operand, context)

    case _:
      str = reader.LocatedString.from_ast_node(expr, source)
      print(str.area.format())

      raise Exception()


if __name__ == "__main__":
  # text = '123 + 0x24 + abs(5 * 6)'
  text = 'abs(-5.4 * (x[2 + 1]) + 1)'
  source = reader.Source(text)

  try:
    tree = ast.parse(text, mode='eval')
  except SyntaxError as e:
    s = reader.LocatedString.from_syntax_error(e, source)
    print(s.area.format())
  else:
    print(ast.dump(tree, indent=2))
    print(evaluate(tree.body, context=EvaluationContext(
      variables={
        'x': [0, 1, 2, 3]
      }
    )))

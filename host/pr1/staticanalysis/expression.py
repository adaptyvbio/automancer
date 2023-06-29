import ast
from pprint import pprint

from .expr import BaseExprDef, BaseExprDefFactory, CompositeExprDef, transfer_node_location

from .context import (StaticAnalysisAnalysis, StaticAnalysisContext,
                      StaticAnalysisDiagnostic)
from .overloads import find_overload
from .special import NoneType
from .type import evaluate_type_expr
from .types import (ClassConstructorDef, ClassDef, ClassDefWithTypeArgs, ExportedTypeDefs,
                    FuncDef, PreludeTypeDefs, PreludeTypeInstances, Symbols, TypeDef, TypeDefs, TypeInstance, TypeInstances, TypeValues,
                    TypeVarDef, TypeVariables, UnionDef, UnknownDef)


def instantiate_type_instance(input_type: ClassDef | ClassConstructorDef[ClassDefWithTypeArgs | ClassDef] | ClassDefWithTypeArgs | UnknownDef, /) -> ClassDefWithTypeArgs | UnknownDef:
  match input_type:
    case ClassDef():
      return ClassDefWithTypeArgs(input_type, [UnknownDef()] * len(input_type.type_variables))
    case ClassDefWithTypeArgs():
      return input_type
    # case ClassConstructorDef(cls, type_args):
    #   return ClassConstructorDef(
    #     instantiate_type_instance(cls)
    #   )
    # case UnionDef(left, right):
    #   return UnionDef(instantiate_type_instance(left), instantiate_type_instance(right))
    # case UnknownDef():
    #   return UnknownDef()
    case _:
      print("Unknown type instance", input_type)
      # raise Exception("Unknown type")
      return UnknownDef()


# @overload
# def resolve_type_variables(input_type: TypeDef, type_values: TypeValues) -> TypeDef:
#   ...

# @overload
# def resolve_type_variables(input_type: TypeDef, type_values: TypeValues) -> TypeDef:
#   ...

def resolve_type_variables(input_type: TypeDef, type_values: TypeValues) -> TypeInstance:
  match input_type:
    case ClassDefWithTypeArgs(cls, type_args):
      return ClassDefWithTypeArgs(cls, type_args=[
        resolve_type_variables(type_arg, type_values) for type_arg in type_args
      ])
    case TypeVarDef():
      return type_values[input_type] # type: ignore
    case UnknownDef():
      return UnknownDef()
    case UnionDef(left, right):
      return UnionDef(
        resolve_type_variables(left, type_values),
        resolve_type_variables(right, type_values)
      )
    case _:
      print(">>", input_type, type_values)
      raise Exception("Unknown type")


def get_attribute(origin_type: TypeInstance, name: str):
  result = list[TypeInstance]()

  for child_type in UnionDef.iter(origin_type):
    match child_type:
      case ClassConstructorDef(cls):
        instantiated = instantiate_type_instance(cls)

        if isinstance(instantiated, UnknownDef):
          return UnknownDef()

        type_inner = instantiated.cls.class_attrs.get(name)

        if type_inner:
          result.append(resolve_type_variables(type_inner, type_values=instantiated.type_values))
        else:
          return None
      case ClassDefWithTypeArgs(cls, type_args):
        attr = cls.instance_attrs.get(name)

        # if type_inner:
        #   result.append(ClassDefWithTypeArgs(type_inner, type_args=cls.type_args))

        if attr:
          if isinstance(attr, FuncDef):
            attr = ClassDefWithTypeArgs(attr, type_args)

          result.append(resolve_type_variables(attr, child_type.type_values))
        else:
          return None
      case UnknownDef():
        return UnknownDef()

  return UnionDef.from_iter(result)

def call(callee: TypeDef, args: list[TypeDef], kwargs: dict[str, TypeDef], node: ast.expr | ast.stmt, context: StaticAnalysisContext) -> tuple[StaticAnalysisAnalysis, TypeInstance]:
  result: list[TypeDef] = []

  for item in UnionDef.iter(callee):
    func_ref = item.cls.instance_attrs.get('__call__')

    if not func_ref:
      return StaticAnalysisDiagnostic("Invalid object for call", node, context).analysis(), UnknownDef()

    assert isinstance(func_ref, FuncDef) # To be removed
    overload = find_overload(func_ref, args=args, kwargs=kwargs, type_values=item.type_values)

    if not overload:
      return StaticAnalysisDiagnostic("Invalid arguments", node, context).analysis(), UnknownDef()

    result.append(resolve_type_variables(overload.return_type, item.type_values))

  return StaticAnalysisAnalysis(), UnionDef.from_iter(result)



BinOpMethodMap: dict[type[ast.operator], str] = {
  ast.Add: 'add',
  ast.BitAnd: 'and',
  ast.Mod: 'divmod',
  ast.FloorDiv: 'floordiv',
  ast.LShift: 'lshift',
  ast.MatMult: 'matmul',
  ast.Mod: 'mod',
  ast.Mult: 'mul',
  ast.BitOr: 'or',
  ast.Pow: 'pow',
  ast.RShift: 'rshift',
  ast.Sub: 'sub',
  ast.Div: 'truediv',
  ast.BitXor: 'xor'
}

UnaryOpMethodMap: dict[type[ast.unaryop], str] = {
  ast.Invert: 'invert',
  ast.Not: 'not',
  ast.UAdd: 'pos',
  ast.USub: 'neg'
}


def evaluate_eval_expr(
    node: ast.expr, /,
    foreign_symbols: tuple[ExportedTypeDefs, dict[str, BaseExprDefFactory]],
    prelude_symbols: tuple[PreludeTypeDefs, PreludeTypeInstances],
    context: StaticAnalysisContext
) -> tuple[StaticAnalysisAnalysis, BaseExprDef]:
  foreign_type_defs, foreign_variables = foreign_symbols
  prelude_type_defs, prelude_variables = prelude_symbols

  match node:
    case ast.Attribute(obj, attr=attr_name, ctx=ast.Load()):
      analysis, obj_expr = evaluate_eval_expr(obj, foreign_symbols, prelude_symbols, context)
      attr_type = get_attribute(obj_expr.type, attr_name)

      if not attr_type:
        analysis.errors.append(StaticAnalysisDiagnostic("Invalid attribute name", node, context))
        attr_type = UnknownDef()

      if attr_expr := obj_expr.get_attribute(attr_name, node):
        return analysis, attr_expr

      return analysis, CompositeExprDef.assemble(
        attr_type,
        [obj_expr],
        lambda nodes: transfer_node_location(node, ast.Attribute(nodes[0], attr_name, ctx=ast.Load()))
      )

    case ast.BinOp(left=left, right=right, op=op):
      analysis = StaticAnalysisAnalysis()

      left_expr = analysis.add(evaluate_eval_expr(left, foreign_symbols, prelude_symbols, context))
      right_expr = analysis.add(evaluate_eval_expr(right, foreign_symbols, prelude_symbols, context))

      if isinstance(left_expr.type, UnknownDef) or isinstance(right_expr.type, UnknownDef):
        result_type = UnknownDef()
      else:
        operator_name = BinOpMethodMap[op.__class__]

        if (method := get_attribute(left_expr.type, f"__{operator_name}__")):
          result_type = analysis.add(call(method, [right_expr.type], dict(), node, context))
        elif (method := get_attribute(right_expr.type, f"__r{operator_name}__")):
          result_type = analysis.add(call(method, [left_expr.type], dict(), node, context))
        else:
          analysis.errors.append(StaticAnalysisDiagnostic("Invalid operation", node, context))
          result_type = UnknownDef()

      return analysis, CompositeExprDef.assemble(
        result_type,
        [left_expr, right_expr],
        lambda nodes: transfer_node_location(node, ast.BinOp(nodes[0], op, nodes[1]))
      )

    case ast.Call(func, args, keywords):
      analysis, func_expr = evaluate_eval_expr(func, foreign_symbols, prelude_symbols, context)

      arg_exprs = analysis.add_sequence([evaluate_eval_expr(arg, foreign_symbols, prelude_symbols, context) for arg in args])
      kwarg_exprs = analysis.add_mapping({ keyword.arg: evaluate_eval_expr(keyword.value, foreign_symbols, prelude_symbols, context) for keyword in keywords if keyword.arg })

      if isinstance(func_expr.type, UnknownDef):
        result_type = UnknownDef()

      elif isinstance(func_expr.type, ClassConstructorDef):
        cls_with_type_args = instantiate_type_instance(func_expr.target)

        if isinstance(cls_with_type_args, UnknownDef):
          return analysis, UnknownDef()

        init_func = cls_with_type_args.cls.instance_attrs['__init__']

        if not isinstance(init_func, FuncDef):
          return analysis + StaticAnalysisDiagnostic("Invalid constructor call", node, context).analysis(), UnknownDef()

        overload = find_overload(init_func, args=args, kwargs=kwargs, type_values=cls_with_type_args.type_values)

        if not overload:
          return analysis + StaticAnalysisDiagnostic("Invalid call", node, context).analysis(), UnknownDef()

        return analysis, cls_with_type_args

      else:
        assert isinstance(func_expr.type, ClassDefWithTypeArgs) # To be removed

        func_type = func_expr.type.cls.instance_attrs.get('__call__')

        if func_type:
          assert isinstance(func_type, FuncDef)
          overload = find_overload(func_type, args=[arg.type for arg in arg_exprs], kwargs={ name: kwarg.type for name, kwarg in kwarg_exprs.items() }, type_values=func_expr.type.type_values)

          if overload:
            result_type = instantiate_type_instance(resolve_type_variables(overload.return_type, func_expr.type.type_values))
          else:
            analysis.errors.append(StaticAnalysisDiagnostic("Invalid arguments", node, context))
            result_type = UnknownDef()

          # return analysis, resolve_type_variables(instantiate_type_instance(overload.return_type), func_type.type_values)
          # return analysis, resolve_type_variables(overload.return_type, func_type.type_values)
        else:
          analysis.errors.append(StaticAnalysisDiagnostic("Invalid object for call", node, context))
          result_type = UnknownDef()

      arg_count = len(args)

      return analysis, CompositeExprDef.assemble(
        result_type,
        [func_expr, *arg_exprs, *kwarg_exprs.values()],
        lambda nodes: transfer_node_location(node, ast.Call(
          nodes[0],
          nodes[1:(arg_count + 1)],
          [(keyword, node) for keyword, node in zip(kwarg_exprs.keys(), nodes[(arg_count + 1):])]
        ))
      )

    case ast.Constant(None):
      return StaticAnalysisAnalysis(), CompositeExprDef(node, instantiate_type_instance(NoneType))

    case ast.Constant(float()):
      return StaticAnalysisAnalysis(), CompositeExprDef(node, instantiate_type_instance(prelude_type_defs['float']))

    case ast.Constant(int()):
      return StaticAnalysisAnalysis(), CompositeExprDef(node, instantiate_type_instance(prelude_type_defs['int']))

    case ast.Constant(str()):
      return StaticAnalysisAnalysis(), CompositeExprDef(node, instantiate_type_instance(prelude_type_defs['str']))

    case ast.FormattedValue(value, conversion, format_spec):
      analysis, expr = evaluate_eval_expr(value, foreign_symbols, prelude_symbols, context)

      return analysis, CompositeExprDef.assemble(
        UnknownDef(), # Not used downstream
        [expr],
        lambda nodes: transfer_node_location(node, ast.FormattedValue(nodes[0], conversion, format_spec))
      )

    case ast.JoinedStr(values):
      analysis, exprs = StaticAnalysisAnalysis.sequence([evaluate_eval_expr(value, foreign_symbols, prelude_symbols, context) for value in values])

      return analysis, CompositeExprDef.assemble(
        instantiate_type_instance(prelude_type_defs['str']),
        exprs,
        lambda nodes: transfer_node_location(node, ast.JoinedStr(nodes))
      )

    case ast.IfExp(test, body, orelse):
      analysis = StaticAnalysisAnalysis()

      test_expr = analysis.add(evaluate_eval_expr(test, foreign_symbols, prelude_symbols, context))
      body_expr = analysis.add(evaluate_eval_expr(body, foreign_symbols, prelude_symbols, context))
      orelse_expr = analysis.add(evaluate_eval_expr(orelse, foreign_symbols, prelude_symbols, context))

      return analysis, CompositeExprDef.assemble(
        UnionDef.from_iter([body_expr.type, orelse_expr.type]),
        [test_expr, body_expr, orelse_expr],
        lambda nodes: transfer_node_location(node, ast.IfExp(nodes[0], nodes[1], nodes[2]))
      )

    case ast.List(elts):
      analysis, elts_exprs = StaticAnalysisAnalysis.sequence([evaluate_eval_expr(elt, foreign_symbols, prelude_symbols, context) for elt in elts])
      list_type = ClassDefWithTypeArgs(prelude_type_defs['list'], type_args=[UnionDef.from_iter([expr.type for expr in elts_exprs])])

      return analysis, CompositeExprDef.assemble(list_type, elts_exprs, lambda elts: transfer_node_location(node, ast.List(elts, ctx=ast.Load())))

    case ast.Name(id=name, ctx=ast.Load()):
      if value := foreign_variables.get(name):
        return StaticAnalysisAnalysis(), value(node)

      variable_value = prelude_variables.get(name)

      if not variable_value:
        return StaticAnalysisDiagnostic("Invalid reference to missing symbol", node, context, name='missing_symbol').analysis(), CompositeExprDef(None, UnknownDef())

      return StaticAnalysisAnalysis(), CompositeExprDef(node, variable_value.type)

    case ast.Slice(lower, upper, step):
      analysis = StaticAnalysisAnalysis()
      lower_type = lower and analysis.add(evaluate_eval_expr(lower, foreign_symbols, prelude_symbols, context))
      upper_type = upper and analysis.add(evaluate_eval_expr(upper, foreign_symbols, prelude_symbols, context))
      step_type = step and analysis.add(evaluate_eval_expr(step, foreign_symbols, prelude_symbols, context))

      return analysis, instantiate_type_instance(prelude_type_defs['slice'])

    case ast.Subscript(value=target, slice=subscript):
      analysis, target_expr = evaluate_eval_expr(target, foreign_symbols, prelude_symbols, context)

      match subscript:
        case ast.Tuple(args, ctx=ast.Load()):
          subscript_items = args
        case _:
          subscript_items = [subscript]

      # if isinstance(target_type, ClassConstructorDef):
      #   target_type = target_type.target

      #   if not isinstance(target_type, ClassDef):
      #     return StaticAnalysisDiagnostic("Invalid subscript target", target, context).analysis(), UnknownDef()

      #   type_args = analysis.add_sequence([evaluate_type_expr(item, (foreign_type_defs | prelude_type_defs), None, context) for item in subscript_items])

      #   if len(type_args) != len(target_type.type_variables):
      #     return analysis + StaticAnalysisDiagnostic("Invalid type argument count", node, context).analysis(), UnknownDef()

      #   return analysis, ClassConstructorDef(ClassDefWithTypeArgs(target_type, [instantiate_type_instance(type_arg) for type_arg in type_args]))

      subscript_expr = analysis.add(evaluate_eval_expr(subscript, foreign_symbols, prelude_symbols, context))

      if isinstance(target_expr.type, UnknownDef) or isinstance(subscript_expr.type, UnknownDef):
        result_type = UnknownDef()
      elif method := get_attribute(target_expr.type, "__getitem__"):
        result_type = analysis.add(call(method, [subscript_expr.type], dict(), node, context))
      else:
        analysis.errors.append(StaticAnalysisDiagnostic("Invalid operation", node, context))
        result_type = UnknownDef()

      return analysis, CompositeExprDef.assemble(
        result_type,
        [target_expr, subscript_expr],
        lambda nodes: transfer_node_location(node, ast.Subscript(nodes[0], nodes[1], ctx=ast.Load()))
      )

      return analysis, result

    case ast.UnaryOp(op, operand):
      analysis, operand_expr = evaluate_eval_expr(operand, foreign_symbols, prelude_symbols, context)

      if isinstance(operand_expr.type, UnknownDef):
        result_type = UnknownDef()
      else:
        operator_name = UnaryOpMethodMap[op.__class__]

        if method := get_attribute(operand_expr.type, f"__{operator_name}__"):
          result_type = analysis.add(call(method, list(), dict(), node, context))
        else:
          analysis.errors.append(StaticAnalysisDiagnostic("Invalid operation", node, context))
          result_type = UnknownDef()

      return analysis, CompositeExprDef.assemble(
        result_type,
        [operand_expr],
        lambda nodes: transfer_node_location(node, ast.UnaryOp(op, nodes[0]))
      )

    case _:
      print("Missing evaluate_eval_expr()", ast.dump(node, indent=2))
      return StaticAnalysisAnalysis(), UnknownDef()


__all__ = [
  'evaluate_eval_expr',
  'instantiate_type_instance'
]

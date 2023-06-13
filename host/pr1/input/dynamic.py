from asyncio import Event
from dataclasses import dataclass
from types import EllipsisType
from typing import Any, AsyncGenerator, Hashable, Iterable, TypeVar

from ..analysis import BaseAnalysis, DiagnosticAnalysis

from ..fiber.parser import AnalysisContext

from ..fiber.eval import EvalContext

from ..fiber.expr import Evaluable, EvaluableConstantValue, EvaluablePythonExpr
from ..langservice import *
from ..reader import LocatedValue
from ..staticanalysis.expr import BaseExprEval, BaseExprWatch, Dependency
from ..util.pool import Pool
from . import PossibleExprType, Type


T_Hashable = TypeVar('T_Hashable', bound=Hashable)


@dataclass
class DynamicValueType(Type):
  _type: Type

  def analyze(self, obj, /, context):
    analysis = LanguageServiceAnalysis()
    current_obj = obj

    result = analysis.add(PossibleExprType().analyze(obj, context))

    if isinstance(result, EllipsisType):
      return analysis, Ellipsis

    if isinstance(result, EvaluableConstantValue):
      new_result = analysis.add(self._type.analyze(result.inner_value, context))

      if isinstance(new_result, EllipsisType):
        return analysis, Ellipsis

      if isinstance(new_result, EvaluableConstantValue):
        return analysis, EvaluableConstantValue(LocatedValue.new(ConstantDynamicValue(new_result.inner_value.value), current_obj.area))
      else:
        return analysis, EvaluableDeferredDynamicValue(new_result)
    else:
      return analysis, EvaluableDynamicValue(result, self._type)


@dataclass
class EvaluableDeferredDynamicValue(Evaluable):
  _obj: Evaluable

  @property
  def dependencies(self):
    return {}

  def evaluate(self, context):
    assert context.stack is not None

    analysis, result = self._obj.evaluate(context)

    if isinstance(result, EllipsisType):
      return analysis, Ellipsis

    if isinstance(result, EvaluableConstantValue):
      return analysis, EvaluableConstantValue(LocatedValue.new(ConstantDynamicValue(result.inner_value.value), result.inner_value.area))

    return analysis, EvaluableDeferredDynamicValue(result)



@dataclass
class EvaluableDynamicValue(Evaluable):
  _obj: EvaluablePythonExpr
  _type: Type

  @property
  def dependencies(self):
    return {}

  def evaluate(self, context):
    if context.stack is None:
      return LanguageServiceAnalysis(), EvaluableConstantValue(LocatedValue.new(VariableDynamicValue(self._type, self._obj, self._obj.expr.to_watched()), self._obj.contents.area))

    analysis, result = self._obj.evaluate(context)

    if isinstance(result, EllipsisType):
      return analysis, Ellipsis

    if isinstance(result, EvaluableConstantValue):
      new_result = analysis.add(self._type.analyze(result.inner_value, AnalysisContext(auto_expr=True))) # type: ignore

      if isinstance(new_result, EllipsisType):
        return analysis, Ellipsis

      if isinstance(new_result, EvaluableConstantValue):
        return analysis, EvaluableConstantValue(LocatedValue.new(ConstantDynamicValue(new_result.inner_value.value), result.inner_value.area))
      else:
        return analysis, EvaluableDeferredDynamicValue(new_result)

    return analysis, EvaluableDynamicValue(result, self._type)

@dataclass
class ConstantDynamicValue:
  value: Any

  async def watch(self, context: EvalContext):
    yield BaseAnalysis(), self.value


async def collect_generators(generators: Iterable[tuple[T_Hashable, AsyncGenerator[None, Any]]]) -> AsyncGenerator[set[T_Hashable], None]:
  changed_items = set[T_Hashable]()
  event = Event()

  async def handle_generator(item: T_Hashable, gen: AsyncGenerator):
    it = aiter(gen)
    await anext(it)
    yield

    async for _ in it:
      changed_items.add(item)
      event.set()

  async with Pool.open() as pool:
    for item, gen in generators:
      await pool.wait_until_ready(handle_generator(item, gen))

    yield set([item for item, _ in generators])

    while True:
      await event.wait()
      event.clear()

      items = changed_items
      changed_items = set[T_Hashable]()

      yield items


@dataclass
class VariableDynamicValue:
  _obj_type: Type
  _obj: EvaluablePythonExpr
  _watched: BaseExprWatch

  async def watch(self, context: EvalContext):
    async for changed_dependencies in collect_generators((dependency, dependency.watch()) for dependency in self._watched.dependencies):
      yield self._evaluate(context, changed_dependencies)

  def _evaluate(self, context: EvalContext, changed_dependencies: set[Dependency]):
    raw_result = self._watched.evaluate(changed_dependencies)

    analysis, result = self._obj_type.analyze(LocatedValue(raw_result, self._obj.contents.area), AnalysisContext(auto_expr=True))

    if isinstance(result, EllipsisType):
      return analysis, Ellipsis

    if not isinstance(result, EvaluableConstantValue):
      result = analysis.add(result.evaluate(context))

    assert isinstance(result, EvaluableConstantValue)
    return analysis, result.inner_value.value

DynamicValue = ConstantDynamicValue | VariableDynamicValue


__all__ = [
  'ConstantDynamicValue',
  'DynamicValue',
  'DynamicValueType',
  'EvaluableDeferredDynamicValue',
  'EvaluableDynamicValue',
  'VariableDynamicValue'
]

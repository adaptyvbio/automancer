from dataclasses import dataclass
from pathlib import Path
from types import EllipsisType
from typing import Any, cast

from pint import Quantity
from pr1.error import Trace
from pr1 import input as lang
from pr1.fiber.eval import EvalContext, EvalEnvs, EvalStack
from pr1.fiber.expr import Evaluable
from pr1.input import (Analysis, Attribute, EnumType, IntType,
                                   PathType, QuantityType, RecordType)
from pr1.fiber.parser import (Attrs, BaseBlock, BaseLeadTransformer,
                              BaseParser, LeadTransformerPreparationResult)
from pr1.fiber.process import BaseProcessData, ProcessBlock
from pr1.reader import LocatedString, LocatedValue
from pr1.util import schema as sc

from . import namespace
from .executor import Executor


capture_schema = sc.Schema({
  'exposure': sc.ParseType(int),
  'objective': str,
  'optconf': str,
  'save': str
})


@dataclass
class ProcessData(BaseProcessData):
  exposure: Evaluable[LocatedValue[Quantity]]
  objective: Evaluable[LocatedString]
  optconf: Evaluable[LocatedString]
  output_path: Evaluable[LocatedValue[Path]]

  def export(self):
    return {
      "exposure": self.exposure.export(),
      "objective": self.objective.export(),
      "optconf": self.optconf.export(),
      "save": self.output_path.export()
    }

  def import_point(self, data, /):
    from .process import ProcessPoint
    return ProcessPoint()


class Transformer(BaseLeadTransformer):
  priority = 100

  def __init__(self, parser: 'Parser'):
    self._parser = parser

    objectives = parser._executor._objectives
    optconfs = parser._executor._optconfs

    assert objectives
    assert optconfs

    self.attributes = {
      'capture': Attribute(
        description="Captures images on the Nikon Ti-2E microscope",
        type=RecordType({
          'exposure': QuantityType('millisecond'),
          'objective': EnumType(*objectives),
          'optconf': EnumType(*optconfs),
          'save': PathType()
        })
      )
    }

  def prepare(self, data: Attrs, /, adoption_envs: EvalEnvs, runtime_envs: EvalEnvs) -> tuple[Analysis, list[LeadTransformerPreparationResult] | EllipsisType]:
    if (attr := data.get('capture')):
      return Analysis(), [LeadTransformerPreparationResult(attr, origin_area=cast(LocatedString, next(iter(data.keys()))).area)]
    else:
      return Analysis(), list()

  def adopt(self, data: Any, /, adoption_stack: EvalStack, trace: Trace) -> tuple[Analysis, BaseBlock | EllipsisType]:
    from .process import Process

    analysis, options = data.eval(EvalContext(adoption_stack), final=False)

    if isinstance(options, EllipsisType):
      return analysis, Ellipsis

    block = analysis.add(self._parser._fiber.wrap(ProcessBlock(
      ProcessData(**options),
      Process
    )))

    return analysis, block



class Parser(BaseParser):
  namespace = namespace

  def __init__(self, fiber):
    super().__init__(fiber)

    self._executor: Executor = fiber.host.executors[namespace]
    self._fiber = fiber
    self.transformers = [Transformer(self)]

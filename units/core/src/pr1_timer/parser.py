import pr1 as am

from . import namespace
from .process import Process


class Parser(am.BaseParser):
  namespace = namespace

  def __init__(self, fiber):
    super().__init__(fiber)

    self.transformers = [am.ProcessTransformer(Process, {
      'wait': am.Attribute(
        description="Wait for a fixed delay",
        documentation=["Accepts either a quantity or the `forever` keyword.", "Examples:\n```prl\nwait: forever\nwait: 10 min\n```\n"],
        type=am.PotentialExprType(am.UnionType(
          am.EnumType('forever'),
          am.QuantityType('second')
        ))
      )
    }, parser=fiber)]

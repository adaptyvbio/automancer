import pr1 as am

from . import namespace
from .process import process


class Parser(am.BaseParser):
  namespace = namespace

  def __init__(self, fiber):
    super().__init__(fiber)

    self.transformers = [am.ProcessTransformer(process, {
      'wait': am.Attribute(
        description="Wait for a fixed delay",
        documentation=["Accepts either a quantity or the `forever` keyword.", "Examples:\n```prl\nwait: forever\nwait: 10 min\n```\n"],
        type=am.UnionType(
          am.EnumType('forever'),
          am.QuantityType('second', min=(1 * am.ureg.ms))
        )
      )
    }, parser=fiber)]

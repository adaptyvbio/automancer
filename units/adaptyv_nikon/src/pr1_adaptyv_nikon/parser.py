import automancer as am

from . import namespace
from .executor import Executor
from .process import Process


class Parser(am.BaseParser):
  namespace = namespace

  def __init__(self, fiber):
    super().__init__(fiber)

    executor: Executor = fiber.host.executors[namespace]
    objectives = executor._objectives
    optconfs = executor._optconfs

    assert objectives is not None
    assert optconfs is not None

    self.transformers = [am.ProcessTransformer(Process, {
      'capture': am.Attribute(
        description="Capture images on the Nikon Ti-2E microscope",
        type=am.RecordType({
          'exposure': am.QuantityType('millisecond'),
          'objective': am.EnumType(*objectives),
          'optconf': am.EnumType(*optconfs),
          'save': am.PathType(),
          'z_offset': am.Attribute(
            am.QuantityType('micrometer'),
            default=(0.0 * am.ureg.µm),
            description="An offset on the Z axis compared to registered grid"
          )
        })
      )
    }, parser=fiber)]

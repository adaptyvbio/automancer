from .. import langservice as lang
from ..expr import PythonExprEvaluator
from ..parser import BlockData, BlockUnitState
from ...units.base import BaseParser
from ...util import schema as sc
from ...util.decorators import debug



class ScoreParser(BaseParser):
  namespace = "score"
  root_attributes = dict()
  segment_attributes = {
    'score': lang.Attribute(optional=True, type=lang.LiteralOrExprType(lang.PrimitiveType(float)))
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def enter_protocol(self, data_protocol):
    pass

  def parse_block(self, block_attrs, context):
    attrs = block_attrs[self.namespace]

    if ('score' in attrs) and ((score_raw := attrs['score']) is not Ellipsis):
      if isinstance(score_raw, PythonExprEvaluator):
        analysis, score = score_raw.evaluate(context)
        # TODO: Do something with 'analysis'

        if score is Ellipsis:
          print(analysis.errors[0].area.format())
          return Ellipsis

        score = score.value
      else:
        score = score_raw.value

      return lang.Analysis(), BlockData(state=ScoreState(score))
    else:
      return lang.Analysis(), BlockData(state=ScoreState(0.0))

@debug
class ScoreState(BlockUnitState):
  def __init__(self, points):
    self.points = points

  def __or__(self, other: 'ScoreState'):
    return ScoreState(self.points + other.points)

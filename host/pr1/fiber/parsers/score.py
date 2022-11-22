from types import EllipsisType
from ..eval import EvalEnvs, EvalStack
from .. import langservice as lang
from ..expr import PythonExprEvaluator
from ..parser import BaseParser, BlockAttrs, BlockData, BlockUnitData, BlockUnitState
from ...util import schema as sc
from ...util.decorators import debug



class ScoreParser(BaseParser):
  namespace = "score"
  root_attributes = dict()
  segment_attributes = {
    'score': lang.Attribute(
      description="Sets the score.",
      optional=True,
      type=lang.LiteralOrExprType(lang.PrimitiveType(float))
    )
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def parse_block(self, block_attrs: BlockAttrs, /, adoption_envs: EvalEnvs, adoption_stack: EvalStack, runtime_envs: EvalEnvs) -> tuple[lang.Analysis, BlockUnitData | EllipsisType]:
    attrs = block_attrs[self.namespace]

    if ('score' in attrs) and ((score_raw := attrs['score']) is not Ellipsis):
      if isinstance(score_raw, PythonExprEvaluator):
        score_raw.envs = runtime_envs

      return lang.Analysis(), BlockUnitData(state=ScoreState([score_raw if isinstance(score_raw, PythonExprEvaluator) else score_raw.value]))
    else:
      return lang.Analysis(), BlockUnitData(state=ScoreState([0.0]))

@debug
class ScoreState(BlockUnitState):
  def __init__(self, points_list, /):
    self.points_list = points_list

  def __or__(self, other: 'ScoreState'):
    return ScoreState(self.points_list + other.points_list)

  def assemble(self, context):
    analysis = lang.Analysis()
    total = 0.0

    for score_raw in self.points_list:
      if isinstance(score_raw, PythonExprEvaluator):
        score_analysis, score = score_raw.evaluate(context, context.parser.analysis_context)
        analysis += score_analysis

        if score is Ellipsis:
          continue

        total += score.value
      else:
        total += score_raw

    return analysis, ScoreStateAssembled(total)

  def export(self):
    return { "pointsList": [points.export() if isinstance(points, PythonExprEvaluator) else points for points in self.points_list] }

@debug
class ScoreStateAssembled:
  def __init__(self, points: float, /):
    self.points = points

  def export(self):
    return { "points": self.points }

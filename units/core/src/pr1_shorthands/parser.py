from dataclasses import dataclass
from types import EllipsisType
from typing import Any, Optional, cast

from pr1.error import ErrorDocumentReference
from pr1.reader import LocatedString, LocationArea, LocationRange, ReliableLocatedDict
from pr1.fiber.opaque import OpaqueValue
from pr1.util.decorators import debug
from pr1.fiber import langservice as lang
from pr1.fiber.eval import EvalEnv, EvalEnvs, EvalStack
from pr1.fiber.parser import AnalysisContext, Attrs, BaseBlock, BaseParser, BaseTransform, BlockData, BlockState, BlockUnitData, BlockUnitPreparationData, FiberParser, Transforms


@debug
class ShorthandBlock(BaseBlock):
  def __init__(self, block: BaseBlock, env: EvalEnv):
    # self._arg = arg
    self._block = block
    self._env = env

  def export(self):
    return self._block.export()


@dataclass(kw_only=True)
class ShorthandItem:
  contents: Attrs | EllipsisType
  definition_range: LocationRange
  env: EvalEnv
  ref_ranges: list[LocationRange]

ShorthandsData = list[tuple[str, BlockData]]

class ShorthandsParser(BaseParser):
  namespace = "shorthands"
  priority = 600

  root_attributes = {
    'shorthands': lang.Attribute(
      decisive=True,
      description="Defines shorthands, parts of steps can be reused.",
      type=lang.KVDictType(lang.StrType(), lang.AnyType())
    )
  }

  def __init__(self, fiber: FiberParser):
    self._fiber = fiber
    self._shorthands = dict[str, ShorthandItem]()

    self.segment_attributes = dict[str, lang.Attribute]()

  def enter_protocol(self, attrs, /, adoption_envs: EvalEnvs, runtime_envs: EvalEnvs):
    analysis = lang.Analysis()

    if (attr := attrs.get('shorthands')):
      for name, data_shorthand in attr.items():
        env = EvalEnv(readonly=True)
        contents = analysis.add(self._fiber.prepare_block(data_shorthand, adoption_envs=[*adoption_envs, env], runtime_envs=[*runtime_envs, env]))

        comments = attr.comments[name]
        regular_comments = [comment for comment in comments if not comment.startswith("@")]

        deprecated = any(comment == "@deprecated" for comment in comments)
        description = regular_comments[0] if regular_comments else None

        self._shorthands[name] = ShorthandItem(
          contents=contents,
          definition_range=name.area.single_range(),
          env=env,
          ref_ranges=list()
        )

        self.segment_attributes[name] = lang.Attribute(
          deprecated=deprecated,
          description=description,
          type=lang.AnyType()
        )

    return analysis

  def leave_protocol(self):
    analysis = lang.Analysis()

    for shorthand_item in self._shorthands.values():
      analysis.renames.append(lang.AnalysisRename([
        shorthand_item.definition_range,
        *shorthand_item.ref_ranges
      ]))

      analysis.relations.append(lang.AnalysisRelation(
        shorthand_item.definition_range,
        shorthand_item.ref_ranges
      ))

    return analysis

  def prepare_block(self, attrs, /, adoption_envs, runtime_envs):
    analysis = lang.Analysis()
    context = AnalysisContext(envs_list=[adoption_envs, runtime_envs])
    prep = dict()

    for shorthand_name, shorthand_value in attrs.items():
      assert isinstance(shorthand_name, LocatedString)

      shorthand_item = self._shorthands[shorthand_name]
      shorthand_item.ref_ranges.append(shorthand_name.area.single_range())

      if isinstance(shorthand_item.contents, EllipsisType):
        continue

      value = analysis.add(lang.PotentialExprType(lang.AnyType(), static=True).analyze(shorthand_value, context))
      prep[shorthand_name] = value

    return analysis, BlockUnitPreparationData(prep)

  def parse_block(self, attrs, /, adoption_stack, trace):
    analysis = lang.Analysis()
    failure = False
    shorthands_data = ShorthandsData()

    for shorthand_name, shorthand_value in attrs.items():
      shorthand_item = self._shorthands[shorthand_name]
      shorthand_trace = trace + [ErrorDocumentReference.from_value(shorthand_name)]

      value = analysis.add(shorthand_value.evaluate(adoption_stack), shorthand_trace)

      if isinstance(value, EllipsisType):
        failure = True
        continue

      shorthand_adoption_stack: EvalStack = {
        **adoption_stack,
        shorthand_item.env: {
          'arg': value.value
        }
      }

      assert not isinstance(shorthand_item.contents, EllipsisType)
      shorthand_result = analysis.add(self._fiber.parse_block(shorthand_item.contents, shorthand_adoption_stack), shorthand_trace)

      if isinstance(shorthand_result, EllipsisType):
        failure = True
        continue

      shorthands_data.append((shorthand_name, shorthand_result))

    return analysis, BlockUnitData(transforms=([ShorthandTransform(shorthands_data, parser=self)] if shorthands_data else list())) if not failure else Ellipsis


@debug
class ShorthandTransform(BaseTransform):
  def __init__(self, shorthands_data: ShorthandsData, /, parser: ShorthandsParser):
    self._parser = parser
    self._shorthands_data = shorthands_data

  def execute(self, state: BlockState, transforms: Transforms, *, origin_area: LocationArea) -> tuple[lang.Analysis, BaseBlock | EllipsisType]:
    analysis = lang.Analysis()
    block_state: BlockState = cast(BlockState, None)
    block_transforms = list()

    for _, shorthand_data in self._shorthands_data:
      transforms += shorthand_data.transforms

      if block_state is not None:
        block_state = shorthand_data.state | block_state
      else:
        block_state = shorthand_data.state

    block = analysis.add(self._parser._fiber.execute(block_state, block_transforms + transforms, origin_area=origin_area))

    if isinstance(block, EllipsisType):
      return analysis, Ellipsis

    for shorthand_name, _ in self._shorthands_data:
      shorthand = self._parser._shorthands[shorthand_name]

      block = ShorthandBlock(block, env=shorthand.env)

    return analysis, block

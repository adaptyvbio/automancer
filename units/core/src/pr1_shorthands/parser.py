from dataclasses import dataclass
from types import EllipsisType
from typing import Any, Optional, cast

from pr1.reader import LocationArea, ReliableLocatedDict
from pr1.fiber.opaque import OpaqueValue
from pr1.util.decorators import debug
from pr1.fiber import langservice as lang
from pr1.fiber.eval import EvalEnv, EvalEnvs, EvalStack
from pr1.fiber.parser import AnalysisContext, Attrs, BaseBlock, BaseParser, BaseTransform, BlockAttrs, BlockData, BlockState, BlockUnitData, BlockUnitPreparationData, BlockUnitState, FiberParser, Transforms, UnresolvedBlockData


class ShorthandEnv(EvalEnv):
  def __init__(self):
    super().__init__(readonly=True)

@debug
class ShorthandBlock(BaseBlock):
  def __init__(self, block: BaseBlock, env: ShorthandEnv):
    # self._arg = arg
    self._block = block
    self._env = env

  def export(self):
    return self._block.export()


@dataclass
class ShorthandItem:
  contents: Attrs | EllipsisType
  deprecated: bool
  description: Optional[str]
  env: ShorthandEnv

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

    for shorthand_name, data_shorthand in attrs.get('shorthands', dict()).items():
      # assert isinstance(data_shorthand, ReliableLocatedDict)

      # comments, _ = data_shorthand.comments
      shorthand_env = ShorthandEnv()

      contents = analysis.add(self._fiber.prepare_block(data_shorthand, adoption_envs=[*adoption_envs, shorthand_env], runtime_envs=[*runtime_envs, shorthand_env]))
      # print("$$", contents)

      self._shorthands[shorthand_name] = ShorthandItem(
        contents=contents,
        # deprecated=any(comment == "@deprecated" for comment in comments),
        # description=(comments[0].value if data_shorthand.comments and not comments[0].startswith("@") else None),
        deprecated=False,
        description=None,
        env=shorthand_env
      )

      self.segment_attributes[shorthand_name] = lang.Attribute(
        deprecated=False,
        description=None,
        optional=True,
        type=lang.AnyType()
      )

    return analysis

  def prepare_block(self, attrs, /, adoption_envs, runtime_envs):
    analysis = lang.Analysis()
    context = AnalysisContext(envs_list=[adoption_envs, runtime_envs])
    prep = dict()

    for shorthand_name, shorthand_value in attrs.items():
      shorthand = self._shorthands[shorthand_name]

      if isinstance(shorthand.contents, EllipsisType):
        continue

      value = analysis.add(lang.PotentialExprType(lang.AnyType(), static=True).analyze(shorthand_value, context))
      prep[shorthand_name] = value

    return analysis, BlockUnitPreparationData(prep)

  def parse_block(self, attrs, /, adoption_stack):
    analysis = lang.Analysis()
    shorthands_data = ShorthandsData()

    for shorthand_name, shorthand_value in attrs.items():
      shorthand = self._shorthands[shorthand_name]
      value = analysis.add(shorthand_value.evaluate(adoption_stack))

      if isinstance(value, EllipsisType):
        continue

      shorthand_adoption_stack = {
        **adoption_stack,
        shorthand.env: {
          'arg': value
        }
      }

      assert not isinstance(shorthand.contents, EllipsisType)
      shorthand_result = analysis.add(self._fiber.parse_block(shorthand.contents, shorthand_adoption_stack))

      if isinstance(shorthand_result, EllipsisType):
        continue

      shorthands_data.append((shorthand_name, shorthand_result))

    return analysis, BlockUnitData(transforms=([ShorthandTransform(shorthands_data, parser=self)] if shorthands_data else list()))


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

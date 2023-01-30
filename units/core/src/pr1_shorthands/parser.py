from dataclasses import dataclass
from types import EllipsisType, NoneType
from typing import Any, Optional, cast

from pr1.error import ErrorDocumentReference
from pr1.fiber.expr import Evaluable, ValueAsPythonExpr
from pr1.reader import LocatedString, LocatedValue, LocationArea, LocationRange, ReliableLocatedDict
from pr1.util.decorators import debug
from pr1.fiber import langservice as lang
from pr1.fiber.eval import EvalEnv, EvalEnvs, EvalStack
from pr1.fiber.parser import AnalysisContext, Attrs, BaseBlock, BaseParser, BaseProgramPoint, BaseTransform, BlockData, BlockProgram, BlockState, BlockUnitData, BlockUnitPreparationData, FiberParser, Transforms


@dataclass(kw_only=True)
class ShorthandStaticItem:
  contents: Attrs | EllipsisType
  definition_range: LocationRange
  env: EvalEnv
  ref_ranges: list[LocationRange]

@dataclass(kw_only=True)
class ShorthandDynamicItem:
  argument: Evaluable[LocatedValue]
  data: BlockData
  name: str

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
    self._shorthands = dict[str, ShorthandStaticItem]()

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

        self._shorthands[name] = ShorthandStaticItem(
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

      prep[shorthand_name] = analysis.add(lang.PotentialExprType(lang.AnyType()).analyze(shorthand_value, context))

    return analysis, BlockUnitPreparationData(prep)

  def parse_block(self, attrs, /, adoption_stack, trace):
    analysis = lang.Analysis()
    failure = False
    shorthands_items = list[ShorthandDynamicItem]()

    for shorthand_name, shorthand_value in attrs.items():
      shorthand_item = self._shorthands[shorthand_name]
      shorthand_trace = trace + [ErrorDocumentReference.from_value(shorthand_name)]

      if isinstance(shorthand_value, EllipsisType):
        failure = True
        continue

      value = analysis.add(shorthand_value.evaluate(adoption_stack), shorthand_trace)

      if isinstance(value, EllipsisType):
        failure = True
        continue

      shorthand_adoption_stack: EvalStack = {
        **adoption_stack,
        shorthand_item.env: {
          'arg': value.value().value if isinstance(value, ValueAsPythonExpr) else None
        }
      }

      assert not isinstance(shorthand_item.contents, EllipsisType)
      shorthand_result = analysis.add(self._fiber.parse_block(shorthand_item.contents, shorthand_adoption_stack), shorthand_trace)

      if isinstance(shorthand_result, EllipsisType):
        failure = True
        continue

      shorthands_items.append(
        ShorthandDynamicItem(
          argument=value,
          data=shorthand_result,
          name=shorthand_name
        )
      )

    return analysis, BlockUnitData(transforms=([ShorthandTransform(shorthands_items, parser=self)] if shorthands_items else list())) if not failure else Ellipsis


@debug
class ShorthandTransform(BaseTransform):
  def __init__(self, items: list[ShorthandDynamicItem], /, parser: ShorthandsParser):
    self._items = items
    self._parser = parser

  def execute(self, state: BlockState, transforms: Transforms, *, origin_area: LocationArea) -> tuple[lang.Analysis, BaseBlock | EllipsisType]:
    analysis = lang.Analysis()
    block_state: BlockState = cast(BlockState, None)
    block_transforms = list()

    for item in self._items:
      transforms += item.data.transforms

      if block_state is not None:
        block_state = item.data.state | block_state
      else:
        block_state = item.data.state

    block = analysis.add(self._parser._fiber.execute(block_state, block_transforms + transforms, origin_area=origin_area))

    if isinstance(block, EllipsisType):
      return analysis, Ellipsis

    for item in self._items:
      shorthand = self._parser._shorthands[item.name]
      block = ShorthandBlock(block, argument=item.argument, env=shorthand.env)

    return analysis, block


@dataclass
class ShorthandProgramPoint(BaseProgramPoint):
  child: BaseProgramPoint

@dataclass
class ShorthandProgramLocation:
  child: Any

  def export(self):
    return self.child.export()

class ShorthandProgram(BlockProgram):
  def __init__(self, block: 'ShorthandBlock', master, parent):
    self._block = block
    self._master = master
    self._parent = parent

    self._child_program: BlockProgram

  def get_child(self, block_key: NoneType, exec_key: NoneType):
    return self._child_program

  def halt(self):
    self._child_program.halt()

  # def import_message(self, message: Any):
  #   match message["type"]:
  #     case "halt":
  #       self.halt()

  async def run(self, initial_point: Optional[ShorthandProgramPoint], parent_state_program, stack, symbol):
    self._child_program = self._block._child.Program(self._block._child, self._master, self)

    analysis, result = self._block._argument.evaluate(stack)

    if isinstance(result, EllipsisType):
      panic(analysis)
      return

    runtime_stack: EvalStack = {
      **stack,
      self._block._env: {
        'arg': result.value
      }
    }

    async for event in self._child_program.run(initial_point and initial_point.child, parent_state_program, runtime_stack, symbol):
      yield event.inherit(
        location=ShorthandProgramLocation(event.location),
        terminated=event.terminated
      )

    del self._child_program

@debug
class ShorthandBlock(BaseBlock):
  Point = ShorthandProgramPoint
  Program = ShorthandProgram

  def __init__(self, child: BaseBlock, /, argument: Evaluable[LocatedValue], env: EvalEnv):
    self._argument = argument
    self._child = child
    self._env = env

  def export(self):
    return self._child.export()

import asyncio

from .parser import BlockProgram, FiberProtocol


class SegExec:
  def __init__(self, *, block, master, parent):
    self._block = block
    self._head = None
    self._master = master
    self._parent = parent

  def create(self):
    pass

  def enter(self):
    async def run():
      await self._block.run()
      self._master._heads.remove(task)
      self._parent.next(self)

    # loop = asyncio.get_event_loop()
    # task = loop.create_task(run())
    task = asyncio.create_task(run())
    self._head = task
    self._master._heads.add(task)

class SegBlock:
  Exec = SegExec

  def __init__(self, delay = 0.1, name = "Untitled"):
    self._delay = delay
    self._name = name

  async def run(self):
    print("[BEG] " + self._name)
    await asyncio.sleep(self._delay)
    print("[END] " + self._name)


class ParExec:
  def __init__(self, *, block, master, parent):
    self._block = block
    self._master = master
    self._parent = parent

    self._children = [None for _ in range(len(self._block._children))]

  def create(self):
    for child_index, child_block in enumerate(self._block._children):
      child_exec = child_block.Exec(block=child_block, master=self._master, parent=self)
      child_exec.create()
      self._children[child_index] = child_exec

  def enter(self):
    for child_exec in self._children:
      child_exec.enter()

  def next(self, child_exec):
    child_index = self._children.index(child_exec)
    self._children[child_index] = None

    if all(child_exec is None for child_exec in self._children):
      self._parent.next(self)


class ParBlock:
  Exec = ParExec

  def __init__(self, children, /):
    self._children = children


class Master:
  def __init__(self, protocol: FiberProtocol, /):
    self.protocol = protocol

    self._heads = set()

    # self._root = SeqBlock([
    #   SegBlock(name="a"),
    #   SegBlock(name="b"),
    #   ParBlock([
    #     SegBlock(2, name="c"),
    #     SegBlock(1, name="d")
    #   ]),
    #   SegBlock(name="e")
    # ])

  def start(self):
    program = self.protocol.root.Program(block=self.protocol.root, master=self, parent=self)
    program.enter()

  def next(self, program: BlockProgram):
    print("Done")


# async def main():
#   m = Master()
#   m.start()

#   while m._heads:
#     await next(iter(m._heads))


# asyncio.run(main())


# asyncio.get_event_loop().run_forever()


if __name__ == "__main__":
  from .parser import FiberParser
  from ..fiber.parsers.activate import AcmeParser
  from ..fiber.parsers.condition import ConditionParser
  from ..fiber.parsers.do import DoParser
  from ..fiber.parsers.repeat import RepeatParser
  from ..fiber.parsers.score import ScoreParser
  from ..fiber.parsers.sequence import SequenceParser
  from ..fiber.parsers.shorthands import ShorthandsParser

  parser = FiberParser(
    """name: Foobar

steps:
  actions:
    - activate: 28 s
    - activate: 34 s
""",
    host=None,
    # Parsers=[SequenceParser, RepeatParser, ShorthandsParser, AcmeParser, ScoreParser]
    Parsers=[SequenceParser, ShorthandsParser, AcmeParser, ScoreParser]
    # Parsers=[DoParser, RepeatParser, SequenceParser, ShorthandsParser, AcmeParser, ScoreParser]
    # parsers={ namespace: unit.Parser for namespace, unit in self.units.items() if hasattr(unit, 'Parser') }
  )

  from pprint import pprint
  pprint(parser.protocol.export())

  if parser.protocol:
    m = Master(parser.protocol)

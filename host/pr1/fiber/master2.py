import asyncio


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


class SeqExec:
  def __init__(self, *, block, master, parent):
    self._block = block
    self._index = None
    self._master = master
    self._parent = parent

  def create(self):
    self._index = 0

    child = self._block._children[self._index]
    self._child = child.Exec(block=child, master=self._master, parent=self)
    self._child.create()

  def enter(self):
    self._child.enter()

  def next(self, exec):
    self._index += 1

    if self._index < len(self._block._children):
      child = self._block._children[self._index]
      self._child = child.Exec(block=child, master=self._master, parent=self)
      self._child.create()
      self._child.enter()
    else:
      self._parent.next(self)

class SeqBlock:
  Exec = SeqExec

  def __init__(self, children, /):
    self._children = children


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
  def __init__(self):
    self._heads = set()
    self._root = SeqBlock([
      SegBlock(name="a"),
      SegBlock(name="b"),
      ParBlock([
        SegBlock(2, name="c"),
        SegBlock(1, name="d")
      ]),
      SegBlock(name="e")
    ])

  def start(self):
    exec = self._root.Exec(block=self._root, master=self, parent=self)
    exec.create()
    exec.enter()

  def next(self, exec):
    print("Done")


async def main():
  m = Master()
  m.start()

  while m._heads:
    await next(iter(m._heads))


asyncio.run(main())


# asyncio.get_event_loop().run_forever()

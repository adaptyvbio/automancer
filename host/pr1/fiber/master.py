import asyncio

from .parser import SegmentBlock
from ..util.decorators import debug


@debug
class Branch:
  def __init__(self, *, process, task):
    self.process = process
    self.task = task

class Master:
  def __init__(self, chip):
    self._branches = dict()
    self._branch_indices = set()
    self._chip = chip
    self._root_block = (...,)

  def _get_blocks(self, path):
    blocks = list()
    block = self._root_block

    for key in path:
      block = block[key]
      blocks.append(block)

    return blocks

  def start(self, start_path):
    # blocks = self._get_blocks(start_path)

    # for block in blocks:
    #   block_result = block.enter()

    #   if block_result:
    #     break

    branches = {(self._root_block, None)}
    branches_done = list()

    for block, states in branches:
      if isinstance(block, SegmentBlock):
        segments.add(block)
        key = block.enter()
        block = block[key]

    self._root.run(self)

    for segment, _, context in branches_done:
      self._create_branch()

  def _create_branch(self, *, context, segment):
    for runner in self._chip.runners:
      runner.enter(segment.state, context=context)

    process = self._chip.runners[segment.process_namespace].create_process(segment.state, context=context)

    async def run():
      await process.run()

    branch = Branch(
      process=process,
      task=asyncio.create_task(run())
    )

    branch_index = 0

    while branch_index in self._branch_indices:
      branch_index += 1

    self._branches[branch_index] = branch
    self._branch_indices.add(branch_index)

  def _delete_branch(self, branch_index):
    del self._branches[branch_index]
    self._branch_indices.remove(branch_index)

  def _next_branch(self, blocks_states):
    blocks_states = blocks_states.copy()

    while blocks_states:
      block, state = blocks_states.pop()
      result = block.next(state)

      if result is not None:
        break

      blocks_states.pop()

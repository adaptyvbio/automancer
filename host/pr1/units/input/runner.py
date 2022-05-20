import asyncio

from ..base import BaseRunner


class Runner(BaseRunner):
  async def run_process(self, segment, seg_index, state):
    await asyncio.Future()

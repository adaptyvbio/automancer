import asyncio

from pr1.units.base import BaseRunner


class Runner(BaseRunner):
  async def run_process(self, segment, seg_index, state):
    await asyncio.Future()

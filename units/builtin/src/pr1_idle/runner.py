import asyncio

from pr1.units.base import BaseRunner


class Runner(BaseRunner):
  def get_state(self):
    return dict()

  def export_state(self, state):
    return { "progress": 0 }

  def import_state(self, data_state):
    return dict()

  async def run_process(self, segment, seg_index, state):
    await asyncio.Future()

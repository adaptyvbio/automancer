from . import namespace
from ..base import BaseRunner


class Runner(BaseRunner):
  def __init__(self, chip, *, host):
    self._host = host

  def enter_segment(self, segment, seg_index):
    if namespace in segment:
      self._host.backend.notify(message=segment[namespace]['message'])

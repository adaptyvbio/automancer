from . import namespace
from ..base import BaseMatrix


class Matrix(BaseMatrix):
  def __init__(self):
    self.model_id = None

  @property
  def model(self):
    return self.model_id and self.host.executors[namespace].models[self.model_id]

  def export(self):
    return { "modelId": self.model_id }

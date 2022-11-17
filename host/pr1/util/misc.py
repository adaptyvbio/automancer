import hashlib
import logging
import traceback
from typing import Protocol


def fast_hash(input):
  return hashlib.sha256(input.encode("utf-8")).hexdigest()

def log_exception(logger, *, level = logging.DEBUG):
  for line in traceback.format_exc().split("\n"):
    if line:
      logger.log(level, line)

class Exportable(Protocol):
  def export(self) -> object:
    ...

import logging
import traceback


def log_exception(logger, *, level = logging.DEBUG):
  for line in traceback.format_exc().split("\n"):
    if line:
      logger.log(level, line)

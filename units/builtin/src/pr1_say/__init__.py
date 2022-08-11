from importlib.resources import files
from pathlib import Path

from pr1.units.base import logger as parent_logger

name = "say"
version = "0"

client_path = Path(files(__name__ + '.client'))
logger = parent_logger.getChild(name)

from .executor import Executor
from .matrix import Matrix

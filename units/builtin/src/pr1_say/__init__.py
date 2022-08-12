from importlib.resources import files
from pathlib import Path

from pr1.units.base import Metadata, logger as parent_logger

namespace = "say"
version = 0

metadata = Metadata(
  description="Voice reports using the macOS say command",
  title="Voice reports"
)

client_path = Path(files(__name__ + '.client'))
logger = parent_logger.getChild(namespace)

from .executor import Executor
from .matrix import Matrix

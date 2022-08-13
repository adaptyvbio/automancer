from importlib.resources import files
from pathlib import Path

from pr1.units.base import Metadata, MetadataIcon, logger as parent_logger

namespace = "say"
version = 0

metadata = Metadata(
  description="Voice reports powered by the built-in macOS voice synthesis command `say`.",
  icon=MetadataIcon(kind='icon', value="mic"),
  title="Voice reports",
  version="v1.0"
)

client_path = Path(files(__name__ + '.client'))
logger = parent_logger.getChild(namespace)

from .executor import Executor
from .matrix import Matrix

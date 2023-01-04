from importlib.resources import files
from pathlib import Path

from pr1.units.base import Metadata, MetadataIcon, logger as parent_logger

namespace = "do"
version = 0

metadata = Metadata(
  description="Do",
  icon=MetadataIcon(kind='icon', value="description"),
  title="Do",
  version="1.0"
)

logger = parent_logger.getChild(namespace)

from .parser import DoParser as Parser

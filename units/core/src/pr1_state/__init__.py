from importlib.resources import files
from pathlib import Path

from pr1.units.base import Metadata, MetadataIcon, logger as parent_logger

namespace = "state"
version = 0

metadata = Metadata(
  description="State",
  icon=MetadataIcon(kind='icon', value="description"),
  title="State",
  version="1.0"
)

client_path = Path(files(__name__ + '.client'))
logger = parent_logger.getChild(namespace)

from .parser import Parser

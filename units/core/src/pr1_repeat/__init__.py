from importlib.resources import files
from pathlib import Path

from pr1.units.base import Metadata, MetadataIcon, logger as parent_logger

namespace = "repeat"
version = 0

metadata = Metadata(
  description="Repeat",
  icon=MetadataIcon(kind='icon', value="replay"),
  title="Repeat",
  version="2.0"
)

client_path = Path(files(__name__ + '.client'))
logger = parent_logger.getChild(namespace)

# from .parser import Parser
# from .runner import Runner

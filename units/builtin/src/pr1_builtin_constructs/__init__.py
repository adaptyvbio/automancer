from importlib.resources import files
from pathlib import Path

from pr1.units.base import Metadata, MetadataIcon, logger as parent_logger

namespace = "builtin_constructs"
version = 0

metadata = Metadata(
  description="Built-in protocol constructs",
  icon=MetadataIcon(kind='icon', value="account_tree"),
  title="Built-in protocol constructs",
  version="1.0"
)

client_path = Path(files(__name__ + '.client'))
logger = parent_logger.getChild(namespace)

from .parser import Parser

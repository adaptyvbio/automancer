from pr1.units.base import Metadata, MetadataIcon, logger as parent_logger


namespace = "builtin_constructs"
version = 0

metadata = Metadata(
  description="Built-in protocol constructs",
  icon=MetadataIcon(kind='icon', value="account_tree"),
  title="Built-in protocol constructs",
  version="1.0"
)

logger = parent_logger.getChild(namespace)

from .parser import Parser

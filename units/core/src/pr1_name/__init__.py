from pr1.units.base import Metadata, MetadataIcon, logger as parent_logger

namespace = "name"
version = 0

metadata = Metadata(
  description="Name",
  icon=MetadataIcon(kind='icon', value="description"),
  title="Name",
  version="1.0"
)

logger = parent_logger.getChild(namespace)

from .parser import NameParser as Parser

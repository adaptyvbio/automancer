from pr1.units.base import Metadata, MetadataIcon, logger as parent_logger


namespace = "okolab"
version = 0

metadata = Metadata(
  description="Okolab",
  icon=MetadataIcon(kind='icon', value="description"),
  title="Okolab",
  version="1.0"
)

logger = parent_logger.getChild(namespace)

from .executor import Executor

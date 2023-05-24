from importlib.resources import files

from pr1.units.base import Metadata, MetadataIcon, logger as parent_logger


namespace = "s3"
version = 0

metadata = Metadata(
  description="S3 Sync",
  icon=MetadataIcon(kind='icon', value="database"),
  title="S3 Sync",
  version="2.0"
)

client_path = files(__name__ + '.client')
logger = parent_logger.getChild(namespace)

from .parser import Parser

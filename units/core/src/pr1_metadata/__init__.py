from importlib.resources import files

from pr1.units.base import Metadata, MetadataIcon, logger as parent_logger


namespace = "metadata"
version = 0

metadata = Metadata(
  description="Unit metadata",
  icon=MetadataIcon(kind='icon', value="description"),
  title="Metadata",
  version="1.0"
)

client_path = files(__name__ + '.client')
logger = parent_logger.getChild(namespace)

from .runner import Runner

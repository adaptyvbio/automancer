from importlib.resources import files

from pr1.units.base import Metadata, MetadataIcon, logger as parent_logger


namespace = "debug"
version = 0

metadata = Metadata(
  description="Simple template unit.",
  icon=MetadataIcon(kind='icon', value="description"),
  title="Debug",
  version="1.0"
)

client_path = files(__name__ + '.client')
logger = parent_logger.getChild(namespace)

from .executor import Executor

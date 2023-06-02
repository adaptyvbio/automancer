from importlib.resources import files

from pr1.units.base import Metadata, MetadataIcon, logger as parent_logger


namespace = "record"
version = 0

metadata = Metadata(
  description="Record",
  icon=MetadataIcon(kind='icon', value="monitoring"),
  title="Record",
  version="2.0"
)

client_path = files(__name__ + '.client')
logger = parent_logger.getChild(namespace)

from .parser import Parser
# from .runner import Runner

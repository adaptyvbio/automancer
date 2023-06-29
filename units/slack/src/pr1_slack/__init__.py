from importlib.resources import files

from pr1.units.base import Metadata, MetadataIcon, logger as parent_logger


namespace = "slack"
version = 0

metadata = Metadata(
  description="Slack",
  icon=MetadataIcon(kind='icon', value="chat"),
  title="Slack",
  version="1.0"
)

client_path = files(__name__ + '.client')
logger = parent_logger.getChild(namespace)

from .parser import Parser

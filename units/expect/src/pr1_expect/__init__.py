from importlib.resources import files

from pr1.units.base import Metadata, MetadataIcon, logger as parent_logger


namespace = "expect"
version = 0

metadata = Metadata(
  description="Expect",
  icon=MetadataIcon(kind='icon', value="notification_important"),
  title="Expect",
  version="1.0"
)

client_path = files(__name__ + '.client')
logger = parent_logger.getChild(namespace)

from .parser import Parser
from .runner import Runner

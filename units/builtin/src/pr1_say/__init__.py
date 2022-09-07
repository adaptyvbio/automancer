from importlib.resources import files

from pr1.units.base import Metadata, MetadataIcon, logger as parent_logger


namespace = "say"
version = 0

metadata = Metadata(
  description="Voice reports powered by the built-in macOS voice synthesis command `say`.",
  icon=MetadataIcon(kind='icon', value="mic"),
  title="Voice reports",
  version="1.0"
)

client_path = files(__name__ + '.client')
logger = parent_logger.getChild(namespace)

from .executor import Executor
from .runner import Runner

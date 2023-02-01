from importlib.resources import files

from pr1.units.base import Metadata, MetadataIcon, logger as parent_logger


namespace = "utils"
version = 0

metadata = Metadata(
  description="Utilities",
  icon=MetadataIcon(kind='icon', value="terminal"),
  title="Utilities",
  version="1.0"
)

client_path = files(__name__ + '.client')
logger = parent_logger.getChild(namespace)

from .executor import Executor
from .parser import Parser
from .runner import Runner

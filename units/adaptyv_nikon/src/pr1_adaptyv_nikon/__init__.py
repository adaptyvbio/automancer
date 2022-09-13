from importlib.resources import files

from pr1.units.base import Metadata, MetadataIcon, logger as parent_logger


namespace = "adaptyv_nikon"
version = 0

metadata = Metadata(
  description="This unit provides imaging functionality using NIS Elements macros.",
  icon=MetadataIcon(kind='icon', value="biotech"),
  title="Adaptyv Nikon",
  version="1.0"
)

client_path = files(__name__ + '.client')
logger = parent_logger.getChild(namespace)

from .executor import Executor
from .parser import Parser
from .runner import Runner

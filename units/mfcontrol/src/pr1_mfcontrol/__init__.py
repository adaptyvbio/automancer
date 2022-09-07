from importlib.resources import files

from pr1.units.base import Metadata, MetadataIcon, logger as parent_logger


namespace = "mfcontrol"
version = 0

metadata = Metadata(
  description="Microfluidic control.",
  icon=MetadataIcon(kind='icon', value="air"),
  title="Microfluidic control",
  version="1.0"
)

client_path = files(__name__ + '.client')
logger = parent_logger.getChild(namespace)

from .executor import Executor
from .parser import Parser
from .runner import Runner

from importlib.resources import files
from pathlib import Path

from pr1.units.base import Metadata, MetadataIcon, logger as parent_logger

namespace = "opcua"
version = 0

metadata = Metadata(
  description="OPC-UA communication.",
  icon=MetadataIcon(kind='icon', value="sensors"),
  title="OPC-UA",
  version="1.0"
)

client_path = Path(files(__name__ + '.client'))
logger = parent_logger.getChild(namespace)

from .executor import Executor
# from .matrix import Matrix
# from .runner import Runner

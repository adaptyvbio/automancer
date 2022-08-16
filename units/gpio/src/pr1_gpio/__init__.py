from importlib.resources import files
from pathlib import Path

from pr1.units.base import Metadata, MetadataIcon, logger as parent_logger

namespace = "gpio"
version = 0

metadata = Metadata(
  description="GPIO utility.",
  icon=MetadataIcon(kind='icon', value="settings_input_hdmi"),
  title="GPIO",
  version="1.0"
)

client_path = Path(files(__name__ + '.client'))
logger = parent_logger.getChild(namespace)

from .executor import Executor

from importlib.resources import files
from pathlib import Path

from pr1.units.base import Metadata, MetadataIcon, logger as parent_logger

namespace = "devices"
version = 0

metadata = Metadata(
  description="Devices",
  icon=MetadataIcon(kind='icon', value="settings_input_hdmi"),
  title="Devices",
  version="3.0"
)

client_path = Path(files(__name__ + '.client'))
logger = parent_logger.getChild(namespace)

# from .parser import Parser
# from .runner import Runner

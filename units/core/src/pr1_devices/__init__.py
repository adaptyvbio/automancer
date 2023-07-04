from importlib.resources import files
from pathlib import Path

import automancer as am


namespace = am.PluginName("devices")
version = 0

metadata = am.Metadata(
  description="Devices",
  icon=am.MetadataIcon(kind='icon', value="settings_input_hdmi"),
  title="Devices",
  version="3.0"
)

client_path = files(__name__ + '.client')
logger = am.logger.getChild(namespace)

from .executor import Executor
from .parser import Parser
from .runner import Runner

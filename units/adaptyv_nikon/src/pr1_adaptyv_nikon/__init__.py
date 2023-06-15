from importlib.resources import files

import automancer as am


namespace = am.PluginName("adaptyv_nikon")
version = 0

metadata = am.Metadata(
  description="This unit provides imaging functionality using NIS Elements macros.",
  icon=am.MetadataIcon(kind='icon', value="biotech"),
  title="Adaptyv Nikon",
  version="2.0"
)

client_path = files(__name__ + '.client')
logger = am.plugin_logger.getChild(namespace)

from .executor import Executor
from .parser import Parser
from .runner import Runner

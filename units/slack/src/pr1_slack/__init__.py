from importlib.resources import files

import automancer as am


namespace = am.PluginName("slack")
version = 0

metadata = am.Metadata(
  description="Slack",
  icon=am.MetadataIcon(kind='icon', value="chat"),
  title="Slack",
  version="1.0"
)

client_path = files(__name__ + '.client')
logger = am.logger.getChild(namespace)

from .parser import Parser

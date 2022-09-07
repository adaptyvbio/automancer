from importlib.resources import files

from pr1.units.base import Metadata, MetadataIcon, logger as parent_logger


namespace = "template"
version = 0

metadata = Metadata(
  description="Template unit.",
  icon=MetadataIcon(kind='icon', value="description"),
  title="Template",
  version="1.0"
)

client_path = files(__name__ + '.client')
logger = parent_logger.getChild(namespace)

# from .executor import Executor
# from .matrix import Matrix
# from .runner import Runner

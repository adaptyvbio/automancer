from pathlib import Path

from pr1.units.base import Metadata, MetadataIcon, logger as parent_logger


namespace = "numato"
version = 0

metadata = Metadata(
  description="This unit adds support to the Numato relay modules.",
  icon=MetadataIcon(kind='svg', value=(Path(__file__).parent / "data/logo.svg").open().read()),
  title="Numato",
  version="3.0"
)

logger = parent_logger.getChild(namespace)

from .executor import Executor

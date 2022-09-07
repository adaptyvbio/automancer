from importlib.resources import files
from pathlib import Path

from pr1.units.base import Metadata, MetadataIcon, logger as parent_logger
from pr1.util.blob import Blob


namespace = "amf"
version = 0

logo = Blob(
  data=(Path(__file__).parent / "data/logo.png").open("rb").read(),
  type="image/png"
)

metadata = Metadata(
  description="Advanced microfluidics",
  icon=MetadataIcon(kind='bitmap', value=logo.to_url()),
  title="AMF",
  version="1.0"
)

client_path = files(__name__ + '.client')
logger = parent_logger.getChild(namespace)

from .executor import Executor
from .parser import Parser
from .runner import Runner

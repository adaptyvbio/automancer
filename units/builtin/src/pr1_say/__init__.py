from importlib.resources import files
from pathlib import Path

from pr1.units.base import Metadata, MetadataIcon, logger as parent_logger

namespace = "say"
version = 0

# from pr1.util.blob import Blob
# logo = Blob(
#   data=(Path(__file__).parent / "logo.png").open("rb").read(),
#   type="image/png"
# )

metadata = Metadata(
  description="Voice reports powered by the built-in macOS voice synthesis command `say`.",
  icon=MetadataIcon(kind='icon', value="mic"),
  # icon=MetadataIcon(kind='bitmap', value=logo.to_url()),
  title="Voice reports",
  version="1.0"
)

client_path = Path(files(__name__ + '.client'))
logger = parent_logger.getChild(namespace)

from .executor import Executor
from .runner import Runner

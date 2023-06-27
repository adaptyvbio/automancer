import asyncio
import functools
from abc import ABC
from asyncio import Future
from collections import namedtuple
from typing import TYPE_CHECKING, Any, ClassVar

from .. import logger as root_logger
from ..input import RecordType, Type

if TYPE_CHECKING:
  from ..fiber.master2 import Master
  from ..host import Host


Metadata = namedtuple("Metadata", ["author", "description", "icon", "license", "title", "url", "version"], defaults=[None, None, None, None, None, None, None])
MetadataIcon = namedtuple("MetadataIcon", ["kind", "value"])


plugin_logger = root_logger.getChild("plugin")

# @deprecated
logger = plugin_logger


# @deprecated
class BaseParser:
  pass


class BaseExecutor:
  options_type: ClassVar[Type] = RecordType({})

  """
  Constructs an executor.

  Parameters
  ----------
  conf : dict
    Section of the setup configuration regarding that unit. An empty dict if not specified in the configuration.
  """
  def __init__(self, conf, *, host: 'Host'):
    pass

  def load(self, context):
    return None

  """
  Initializes the executor.
  """
  async def initialize(self):
    pass

  """
  Destroys the executor.
  """
  async def destroy(self):
    pass

  async def start(self):
    await self.initialize()
    yield

    try:
      await Future()
    except asyncio.CancelledError:
      await self.destroy()

  """
  Exports the executor's data.

  Returns
  -------
  Dict
  """
  def export(self):
    return dict()

  """
  Answers a client request.

  Parameters
  ----------
  instruction : any
    Instruction provided by the client.
  """
  async def instruct(self, instruction):
    pass

  async def request(self, request: Any, /, agent):
    pass

  """
  Hashes this executor options of this setup.

  Returns
  -------
  str
  """
  @functools.cached_property
  def hash(self):
    return str()


class BaseRunner(ABC):
  def __init__(self, master: 'Master'):
    ...

  async def cleanup(self):
    pass

  def export(self):
    return None

  async def request(self, request: Any, /, agent) -> Any:
    pass


__all__ = [
  'BaseExecutor',
  'BaseParser',
  'BaseRunner',
  'Metadata',
  'MetadataIcon',
  'plugin_logger'
]

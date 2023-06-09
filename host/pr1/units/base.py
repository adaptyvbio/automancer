import asyncio
import functools
import pickle
from abc import ABC
from asyncio import Future
from collections import namedtuple
from typing import TYPE_CHECKING, Any, Optional, Protocol

from .. import logger as root_logger
from ..input import AnyType

if TYPE_CHECKING:
  from ..fiber.master2 import Master


Metadata = namedtuple("Metadata", ["author", "description", "icon", "license", "title", "url", "version"], defaults=[None, None, None, None, None, None, None])
MetadataIcon = namedtuple("MetadataIcon", ["kind", "value"])


logger = root_logger.getChild("unit")


class BaseParser:
  pass


class BaseRunner(Protocol):
  pass


  def transfer_state(self):
    pass

  def write_state(self):
    pass


class BaseProcessRunner(BaseRunner):
  def get_state(self):
    return dict()

  def export_state(self, state):
    return None

  def import_state(self, data_state):
    return None

  async def run_process(self, segment, seg_index, state):
    pass

  def pause_process(self, segment, seg_index):
    return dict()


class BaseExecutor:
  options_type = AnyType()

  """
  Constructs an executor.

  Parameters
  ----------
  conf : dict
    Section of the setup configuration regarding that unit. An empty dict if not specified in the configuration.
  """
  def __init__(self, conf, *, host):
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


class BaseMasterRunner(ABC):
  def __init__(self, master: 'Master'):
    ...

  async def cleanup(self):
    pass

  def export(self):
    return None

  async def request(self, request: Any, /, agent) -> Any:
    pass

import asyncio
import functools
import pickle
from abc import ABC
from asyncio import Future
from collections import namedtuple
from typing import TYPE_CHECKING, Any, Optional, Protocol

from .. import logger as root_logger
from ..input import AnyType
from ..fiber.process import BaseProcess as ProcessProtocol
from ..state import UnitStateInstance, UnitStateManager

if TYPE_CHECKING:
  from ..fiber.master2 import Master


Metadata = namedtuple("Metadata", ["author", "description", "icon", "license", "title", "url", "version"], defaults=[None, None, None, None, None, None, None])
MetadataIcon = namedtuple("MetadataIcon", ["kind", "value"])


logger = root_logger.getChild("unit")


class BaseParser:
  pass


class BaseRunner(Protocol):
  Process: Optional[type[ProcessProtocol]] = None
  StateConsumer: Optional[type[UnitStateInstance] | type[UnitStateManager]] = None
  dependencies = set[str]()

  def __init__(self, *, chip, host):
    pass

  async def command(self, data):
    pass

  def create(self):
    pass

  def duplicate(self, other, *, template):
    self.unserialize(other.serialize())

  def export(self):
    return dict()

  def serialize(self):
    return None

  def unserialize(self, state):
    pass

  def serialize_raw(self):
    return pickle.dumps(self.serialize())

  def unserialize_raw(self, data):
    self.unserialize(pickle.loads(data))

  def start_protocol(self, runner):
    pass

  def enter_segment(self, segment, seg_index):
    pass

  def leave_segment(self, segment, seg_index):
    pass

  def resume_segment(self, segment, seg_index, options):
    pass

  def pause(self, options):
    pass

  def update(self):
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
    ...

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
    ...

  def command(self, data: Any, /):
    ...

from collections import namedtuple
import pickle

from .. import logger as root_logger


# used?
Device = namedtuple("Device", ["description", "build", "id", "name"])

Metadata = namedtuple("Metadata", ["author", "description", "license", "title", "url", "version"], defaults=[None, None, None, None, None, None])


logger = root_logger.getChild("unit")


class BaseParser:
  priority = 0
  protocol_keys = set()

  def __init__(self, protocol):
    self._master = protocol

  def enter_protocol(self, data_protocol):
    pass

  def leave_protocol(self, data_protocol):
    pass

  def enter_stage(self, stage_index, data_stage):
    pass

  def leave_stage(self, stage_index, data_stage):
    pass


  def parse_block(self, data_block):
    return None

  def enter_block(self, data_block):
    pass

  def leave_block(self, data_block):
    pass


  def handle_segment(self, data_segment):
    return None


  def export_protocol(self):
    return dict()

  def export_segment(data):
    return None


  # Return value:
  #  { data: { ... }, role: 'process' }
  def parse_action(self, data_action):
    return None


class BaseRunner:
  def __init__(self, chip, *, host):
    pass

  async def initialize(self):
    pass

  def export(self):
    return dict()

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
  """
  Constructs an executor.

  Parameters
  ----------
  conf : dict
    Section of the setup configuration regarding that unit. An empty dict if not specified in the configuration.
  """
  def __init__(self, conf, *, host):
    pass

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

  """
  Returns the list of devices associated with the executor.

  Returns
  -------
  List<DeviceInformation>
  """
  def get_devices(self):
    return list()

  """
  Exports the executor's data.

  Returns
  -------
  Dict
  """
  def export(self):
    return dict()

  """
  Returns true if the provided version is supported.

  Parameters : any
    Version to be tested.
  """
  def supports(_version):
    return True


class BaseMatrix:
  def __init__(self, *, chip, host):
    pass

  def create(self):
    pass

  def update(self, update_data):
    pass

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

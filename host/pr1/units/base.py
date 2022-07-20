from collections import namedtuple
import base64
import pickle


# used?
Device = namedtuple("Device", ["description", "build", "id", "name"])


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


  def create_supdata(self, chip, codes):
    return None

  def export_protocol(self):
    return dict()

  def export_segment(data):
    return None

  def export_supdata(data):
    return None


  # Return value:
  #  { data: { ... }, role: 'process' }
  def parse_action(self, data_action):
    return None


class BaseRunner:
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
  def __init__(self, conf):
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


class BaseSheet:
  def serialize(self):
    # print(pickle.dumps(self, 0))
    return base64.b85encode(pickle.dumps(self)).decode("utf-8")

  def unserialize(data):
    return pickle.loads(base64.b85decode(data.encode("utf-8")))

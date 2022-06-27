from collections import namedtuple


# used?
Device = namedtuple("Device", ["description", "build", "id", "name"])


class BaseParser:
  priority = 0

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

  def get_state(self):
    return dict()

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

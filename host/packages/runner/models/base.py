from collections import namedtuple


# used?
Device = namedtuple("Device", ["description", "build", "id", "name"])


class BaseParser:
  def __init__(self, master):
    self._master = master

  def enter_protocol(self, data_protocol):
    pass

  def enter_stage(self, stage_index, data_stage):
    pass

  def leave_stage(self, stage_index, data_stage):
    pass

  # def prepare_block(self, data_action):
  def parse_action(self, data_action):
    pass

  def enter_block(self, data_block):
    pass

  def leave_block(self, data_block):
    pass

  def handle_segment(self, data_action):
    pass

  def export_protocol(self):
    return dict()


  # Return value:
  #  { data: { ... }, role: 'process' }
  def parse_action(self, data_action):
    return None


class BaseRunner:
  async def initialize(self):
    pass

  def get_log(self):
    return dict()

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

  def pause(self):
    pass


class BaseProcessRunner(BaseRunner):
  def run_process(self, segment, seg_index, state, callback):
    pass

  def pause_process(self):
    pass

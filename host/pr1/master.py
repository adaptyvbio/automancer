import asyncio
import time


class Master:
  def __init__(self, chip, codes, location, protocol, *, done_callback, update_callback):
    self.chip = chip
    self.codes = codes
    self.protocol = protocol

    self._pause_options = None
    self._process_state = location['state']
    self._seg_index = location['segment_index']
    self._task = None

    self._log_data = list()
    self._done_callback = done_callback
    self._update_callback = update_callback


  @property
  def _segment(self):
    return self.protocol.segments[self._seg_index]

  @property
  def _paused(self):
    return self._pause_options is not None

  @property
  def _process_runner(self):
    return self.chip.runners[self._segment.process_namespace]


  def _log(self, error = None):
    self._log_data.append({
      'error': error,
      'pause_options': self._pause_options,
      'process_state': self._process_state or self._process_runner.get_state(),
      'segment_index': self._seg_index,
      'time': time.time()
    })

    print(self._log_data[-1])
    self._update_callback()

  def _enter_segment(self):
    if self._paused:
      options = self._pause_options
      self._pause_options = None

      for runner in self.chip.runners.values():
        runner.resume_segment(options, self._segment.data, self._seg_index)
    else:
      for runner in self.chip.runners.values():
        runner.enter_segment(self._segment.data, self._seg_index)

    self._log()

    async def coroutine():
      process_state = self._process_state
      self._process_state = None

      try:
        await self._process_runner.run_process(
          self._segment.data, self._seg_index, process_state
        )
      except asyncio.exceptions.CancelledError:
        pass
      except Exception as e:
        self._pause_options = { 'neutral': False }
        self._process_state = self._process_runner.get_state()
        self._task = None
        self._log(error=str(e))
      else:
        self._leave_segment()

    def done_callback(future):
      if future.exception():
        future.result()

    loop = asyncio.get_event_loop()
    self._task = loop.create_task(coroutine())
    self._task.add_done_callback(done_callback)

  def _leave_segment(self, next_segment_index = None, next_process_state = None):
    segment = self._segment

    self._log()

    for runner in self.chip.runners.values():
      runner.leave_segment(segment.data, self._seg_index)

    self._process_state = next_process_state
    self._seg_index = (next_segment_index if next_segment_index is not None else self._seg_index + 1)
    self._task = None

    if self._seg_index < len(self.protocol.segments):
      self._enter_segment()
    else:
      self._done_callback()

  def start(self):
    for namespace, runner in self.chip.runners.items():
      runner.start_protocol(self.codes)

    self._enter_segment()

  def pause(self, options):
    if self._paused:
      raise Exception("Already paused")

    self._pause_options = options
    self._process_state = self._process_runner.get_state()

    if self._task:
      self._task.cancel()

    for runner in self.chip.runners.values():
      runner.pause(options)

    self._log()

  def resume(self):
    if not self._paused:
      raise Exception("Not paused")

    self._enter_segment()

  # TODO: deprecate in favor of set_location()
  def skip_segment(self, segment_index, process_state = None):
    if self._task:
      self._task.cancel()

    self._leave_segment(segment_index, process_state)

    # self._log()

    # self._process_state = process_state
    # self._seg_index = segment_index

    # self._enter_segment()

  def set_location(self, location):
    if self._task:
      self._task.cancel()

    self._leave_segment(location['segment_index'], location['state'])

  def import_location(self, location):
    segment = self.protocol.segments[location["segmentIndex"]]
    runner = self.chip.runners[segment.process_namespace]

    state = runner.import_state(location["state"])

    return {
      'segment_index': location["segmentIndex"],
      'state': state
    }

  def export(self):
    return {
      "entries": [
        {
          "error": entry['error'],
          "paused": entry['pause_options'] is not None,
          "processState": self._process_runner.export_state(entry['process_state']),
          "segmentIndex": entry['segment_index'],
          "time": round(entry['time'] * 1000)
        } for entry in self._log_data
      ],
      "protocol": self.protocol.export()
    }

import asyncio
import time


class Master:
  def __init__(self, chip, codes, protocol, *, update_callback):
    self.chip = chip
    self.codes = codes
    self.protocol = protocol
    self.supdata = protocol.create_supdata(chip, codes)

    self._paused = False
    self._process_state = None
    self._seg_index = 0
    self._task = None

    self._log_data = list()
    self._update_callback = update_callback


  @property
  def _segment(self):
    return self.protocol.segments[self._seg_index]

  @property
  def _process_runner(self):
    return self.chip.runners[self._segment.process_namespace]


  def _log(self, error = None):
    self._log_data.append({
      'error': error,
      'paused': self._paused,
      'process_state': self._process_state or self._process_runner.get_state(),
      'segment_index': self._seg_index,
      'time': time.time()
    })

    # print(f"[{time.time()}] {'Paused' if self._paused else str()} {self._seg_index}")
    print(self._log_data[-1])
    self._update_callback()

  def _enter_segment(self):
    for runner in self.chip.runners.values():
      runner.enter_segment(self._segment.data, self._seg_index)

    self._log()

    async def coroutine():
      # TODO: exceptions raised here are silent

      process_state = self._process_state
      self._process_state = None

      try:
        await self._process_runner.run_process(
          self._segment.data, self._seg_index, process_state
        )
      except Exception as e:
        self._paused = True
        self._process_state = self._process_runner.get_state()
        self._task = None
        self._log(error=str(e))
      else:
        self._leave_segment()

    loop = asyncio.get_event_loop()
    self._task = loop.create_task(coroutine())

  def _leave_segment(self) -> None:
    segment = self._segment

    self._log()

    for runner in self.chip.runners.values():
      runner.leave_segment(segment.data, self._seg_index)

    self._seg_index += 1
    self._task = None

    if self._seg_index < len(self.protocol.segments):
      self._enter_segment()
    else:
      pass # Done

  def start(self):
    for namespace, runner in self.chip.runners.items():
      runner.start_protocol(self.codes)

    self._enter_segment()

  def pause(self):
    if self._paused:
      raise Exception("Already paused")

    self._paused = True
    self._process_state = self._process_runner.get_state()
    # self._process_runner.pause_process(self._segment.data, self._seg_index)

    if self._task:
      self._task.cancel()

    self._log()

  def resume(self):
    if not self._paused:
      raise Exception("Not paused")

    self._paused = False
    self._enter_segment()

  def export(self):
    return {
      "entries": [
        {
          "error": entry['error'],
          "paused": entry['paused'],
          "processState": entry['process_state'],
          "segmentIndex": entry['segment_index'],
          "time": round(entry['time'] * 1000)
        } for entry in self._log_data
      ],
      "supdata": self.protocol.export_supdata(self.supdata),
      "protocol": self.protocol.export()
    }

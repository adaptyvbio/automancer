from enum import IntEnum

from . import namespace
from ..base import BaseRunner
from ..microfluidics import namespace as mf_namespace


class ValveError(IntEnum):
  Unbound = 0
  Unresponsive = 1


class Runner(BaseRunner):
  def __init__(self, chip, *, host):
    self._chip = chip
    self._host = host

    self._code = None
    self._executor = self._host.executors[namespace]
    self._matrix = chip.matrices[namespace]

    # sequence
    self._drive = None

    self._chip_signal = 0
    self._default_chip_signal = None

    self.update()

  @property
  def _model(self):
    model_id = self._chip.matrices[mf_namespace].model_id
    return self._host.executors[mf_namespace].models[model_id] if model_id else None


  # Client communication

  def command(self, command):
    if command["type"] == "signal":
      self._chip_signal = int(command["signal"])
      self._write()

  def export(self):
    return {
      "drive": self._drive,
      "signal": str(self._chip_signal),
      "valves": [{
        "error": ValveError.Unbound if (self._matrix.valves[valve_index].host_valve_index is None) else None
      } for valve_index, valve in enumerate(self._matrix.valves)]
    } if self._model else None

  # Called following a matrix update
  def update(self):
    if self._model:
      self._default_chip_signal = sum([1 << channel_index for channel_index, channel in enumerate(self._model.channels) if channel.inverse])
      self._write()
    else:
      self._default_chip_signal = None


  def _write(self):
    executor_signal = self._matrix.permutation.permute(self._chip_signal ^ self._default_chip_signal)
    self._executor.write(executor_signal)

  # def log(self):
  #   return {
  #     # Current state
  #     "drive": str(self._drive) if self._proto_signal is not None else None,
  #     "signal": str(self._signal)
  #   }


  # Manual control

  # def accept(self, command):
  #   if command['type'] == "set":
  #     mask = int(command['mask'])

  #     self._signal = (self._signal & ~mask) | (int(command['signal']) & mask)

  #     if self._drive is not None:
  #       self._drive |= mask

  #     self._write()

  #   if command['type'] == "undrive":
  #     self._drive = self._drive & ~int(command['sequence'])
  #     self._write()


  # Automated control

  def start_protocol(self, codes):
    self._code = codes[namespace]

    self._drive = 0
    self._proto_signal = 0
    self._proto_permutation = BinaryPermutation([arg for arg in self._code['arguments']])

  def end_protocol(self):
    self._drive = None
    self._proto_signal = None
    self._proto_permutation = None

  def enter_segment(self, segment, seg_index):
    self._handle_segment(segment)

  def pause(self, options):
    if not options['neutral']:
      self._chip_signal = 0
      self._write()

  def resume_segment(self, options, segment, seg_index):
    if not options['neutral']:
      self._handle_segment(segment)

  def _handle_segment(self, segment):
    seg = segment[namespace]
    proto_signal = sum([1 << arg_index for arg_index in seg['valves']])

    self._chip_signal = self._proto_permutation.permute(proto_signal)
    self._write()


class BinaryPermutation:
  def __init__(self, indices):
    self._indices = indices

  def permute(self, value):
    return sum([(1 << dest_index) for source_index, dest_index in enumerate(self._indices) if (dest_index is not None) and (value & (1 << source_index)) > 0])

  def inverse(self, value):
    return sum([(1 << source_index) for source_index, dest_index in enumerate(self._indices) if (dest_index is not None) and (value & (1 << dest_index)) > 0])


if __name__ == "__main__":
  import random

  print("---")

  indices = list(range(8))

  for _ in range(10):
    random.shuffle(indices)
    perm = BinaryPermutation(indices)

    for _ in range(10):
      num = random.randrange(1 << 8)
      a = perm.permute(num)
      b = perm.inverse(a)
      print(f"{indices} {num:08b} {a:08b} {b:08b} {num == b}")

from enum import IntEnum

from . import namespace
from ..base import BaseRunner


class ValveError(IntEnum):
  Unbound = 0
  Unresponsive = 1


class Runner:
  def __init__(self, executor, chip):
    self._chip = chip
    self._executor = executor

    self._matrix = chip.matrices[namespace]
    self._sheet = chip.model.sheets[namespace]

    # sequence
    self._drive = None
    self._signal = 0


  # Client communication

  def command(self, command):
    self._permutation = BinaryPermutation([valve.host_valve_index for valve in self._matrix.valves])

    if command["type"] == "signal":
      self._signal = int(command["signal"])
      self._write()

  def export(self):
    return {
      "drive": self._drive,
      "signal": str(self._signal),
      "valves": [{
        "error": ValveError.Unbound if (self._matrix.valves[valve_index].host_valve_index is None) else None
      } for valve_index, valve in enumerate(self._matrix.valves)]
    }


  def _write(self):
    self._executor.write(self._permutation.permute(self._signal))

  def log(self):
    return {
      # Current state
      "drive": str(self._drive) if self._proto_signal is not None else None,
      "signal": str(self._signal)
    }


  # Driver communication

  # def _write(self):
  #   signal = self._signal if self._proto_signal is None else (self._signal & self._drive) | (self._proto_signal & ~self._drive)
  #   self._driver.write(signal)


  # Manual control

  def accept(self, command):
    if command['type'] == "set":
      mask = int(command['mask'])

      self._signal = (self._signal & ~mask) | (int(command['signal']) & mask)

      if self._drive is not None:
        self._drive |= mask

      self._write()

    if command['type'] == "undrive":
      self._drive = self._drive & ~int(command['sequence'])
      self._write()


  # Automated control

  def start_protocol(self):
    self._drive = 0
    self._proto_signal = 0

  def end_protocol(self):
    self._drive = None
    self._proto_signal = None

  def enter_segment(self, segment, seg_index):
    seg = segment[namespace]
    signal = 0

    for valve_index in seg['valves']:
      signal |= (1 << self._sheet.valves[valve_index].channel)

    self._proto_signal = signal
    self._signal = (self._signal & self._drive) | (signal & ~self._drive)
    self._write()

  def leave_segment(self, segment, seg_index):
    pass

  def pause(self):
    self._driver.set(0)
    self._value = 0


class BinaryPermutation:
  def __init__(self, indices):
    self._indices = indices
    pass

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

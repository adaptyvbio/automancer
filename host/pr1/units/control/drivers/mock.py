from ...base import Device


class Driver:
  def __init__(self, name = None):
    self._name = name
    self._signal = 0

  def get_name(self):
    return None

  def read(self):
    return self._signal

  def write(self, signal):
    self._signal = signal
    print(f"[{self._name or 'Mock driver'}] Write", signal, bin(signal))

  # def list_devices() -> list[Device]:
  #   return [Device(
  #     id="mock.0",
  #     name="Dummy device",
  #     description="I'm a dummy device!",
  #     build=Driver
  #   )]


  def from_spec(spec):
    return Driver(name=spec.get('name'))

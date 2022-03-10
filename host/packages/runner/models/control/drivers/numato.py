import serial

from ....drivers.serial import SerialDriver, SerialDriverDevice


class Driver(SerialDriver):
  device = SerialDriverDevice(product_id=0x0c04, vendor_id=0x2a19)

  def __init__(self, path: str):
    super().__init__(path)

    self._signal = 0

    if self.get_version() != 8:
      raise Exception("Unknown version")

  # def read(self) -> int:
  #   return self._signal

  # def write(self, signal: int):
  #   self._signal = signal


  def get_version(self):
    return int(self._request("ver"))

  def read(self) -> int:
    return int(self._request("relay readall"), 16)

  def write(self, signal: int) -> None:
    self._order("relay writeall " + format(signal, '08x'))


  def _order(self, text):
    try:
      self._serial.write((text + "\r").encode("utf-8"))
    except serial.serialutil.SerialException as e:
      if self._onlost:
        self._onlost()

      raise e

    self._serial.readline()

  def _request(self, text):
    self._order(text)

    result = self._serial.readline().decode("utf-8").strip()

    if not result or result == ">":
      raise Exception("No response")

    return result


  def from_spec(spec):
    return Driver(spec['path'])

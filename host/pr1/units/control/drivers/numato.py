class Driver:
  def __init__(self, port):
    import serial

    self._serial = serial.Serial(port, timeout=0.5)
    self._signal = 0

    self._onlost = None

    if self.get_version() != 8:
      raise Exception("Unknown version")

  def get_name(self):
    return self._serial.name

  def get_version(self):
    return int(self._request("ver"))

  def read(self):
    return int(self._request("relay readall"), 16)

  def write(self, signal):
    self._order("relay writeall " + format(signal, '08x'))


  def _order(self, text):
    import serial

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
    return Driver(spec['port'])

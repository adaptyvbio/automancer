from collections import namedtuple


class DeviceInformation:
  def __init__(self, *, data = dict(), id, name):
    self.data = data
    self.id = id
    self.name = name

  def export(self):
    return {
      "data": self.data,
      "id": self.id,
      "name": self.name
    }

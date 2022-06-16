import base64


class Blob:
  def __init__(self, *, data, type):
    self.data = data
    self.type = type

  def to_url(self):
    data_str = base64.b64encode(self.data).decode("utf-8")
    return f"data:{self.type};base64,{data_str}"

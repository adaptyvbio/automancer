
from pr1.devices.node import BooleanWritableNode, CollectionNode, DeviceNode


class MockDevice(DeviceNode):
  id = "Mock"
  label = "Mock device"
  model = "Mock device"
  owner = "devices"

  def __init__(self):
    super().__init__()
    self.connected = False

    self.nodes = {
      'valueBool': MockBoolNode()
    }

class MockBoolNode(BooleanWritableNode):
  id = "valueBool"
  label = "Bool value"

  def __init__(self):
    super().__init__()
    self.connected = False

    self.current_value = False
    self.target_value = False

  async def write(self, value: bool):
    print("MockBoolNode.write", value)

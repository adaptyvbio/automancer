
from pr1.devices.node import BooleanWritableNode, CollectionNode, DeviceNode


class MockDevice(DeviceNode):
  id = "Mock"
  model = "Mock device"
  owner = "devices"

  def __init__(self):
    super().__init__()

    self.nodes = {
      'valueBool': MockBoolNode()
    }

class MockBoolNode(BooleanWritableNode):
  id = "valueBool"
  label = "Bool value"

  async def write(self, value: bool):
    print("MockBoolNode.write", value)

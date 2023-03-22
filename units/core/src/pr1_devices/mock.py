from pr1.devices.nodes.collection import DeviceNode
from pr1.devices.nodes.common import NodeId


class MockDevice(DeviceNode):
  description = None
  id = NodeId("Mock")
  label = "Mock device"
  model = "Mock device"
  owner = "devices"

  def __init__(self):
    super().__init__()
    self.connected = True

    self.nodes = {
      # 'valueBool': MockBoolNode()
    }

# class MockBoolNode(BooleanWritableNode):
#   id = "valueBool"
#   description = None
#   label = "Bool value"

#   def __init__(self):
#     super().__init__()
#     self.connected = True

#     self.current_value = False
#     self.target_value = False

#   async def write(self, value: bool):
#     print("MockBoolNode.write", value)

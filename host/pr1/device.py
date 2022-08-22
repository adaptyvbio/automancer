from collections import namedtuple


# Deprecated
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


# class BooleanNode:
#   def export(self):
#     return {
#       "type": "value",
#       "kind": "boolean",
#       "value": self.value
#     }

#   async def write_import(self, value):
#     await self.write(value)


SelectNodeOption = namedtuple('SelectNodeOption', ['label', 'value'])

class SelectNode:
  def export(self):
    def find_option_index(value):
      return next((index for index, option in enumerate(self.options) if option.value == value), None)

    return {
      "type": "select",
      "options": [{ 'label': option.label } for option in self.options],
      "targetValue": find_option_index(self.target_value),
      "value": find_option_index(self.value)
    }

  async def write_import(self, option_index):
    value = self.options[option_index].value
    await self.write(value)

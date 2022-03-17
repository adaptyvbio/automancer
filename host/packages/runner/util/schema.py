from ..reader import LocatedValue


def Schema(value):
  if type(value) == dict:
    return SchemaDict(value)
  if callable(value):
    return SchemaType(value)

  return value

class SchemaType:
  def __init__(self, exptype):
    self._exptype = exptype

  def transform(self, obj):
    pass

  def validate(self, obj):
    if isinstance(obj, LocatedValue):
      if type(obj.value) != self._exptype:
        raise obj.error(f"Invalid type '{type(obj.value).__name__}', expected '{self._exptype.__name__}'")
    elif type(obj) != self._exptype:
      raise Exception(f"Invalid type '{type(obj).__name__}', expected '{self._exptype.__name__}'")

  def __repr__(self):
    return self._exptype.__name__

class SchemaDict(SchemaType):
  def __init__(self, arg):
    super().__init__(dict)
    self._dict = { key: Schema(value) for key, value in arg.items() }

  def transform(self, obj):
    # TODO: actually shouldn't raise if not a dict
    super().validate(obj)

    output = dict(obj)

    for key, value in self._dict.items():
      transformed = value.transform(obj.get(key))

      if transformed is not None:
        output[key] = transformed
      else:
        value.validate(obj.get(key))

    return output

  def validate(self, obj):
    super().validate(obj)

    for key, value in self._dict.items():
      # if not (key in obj):
      #   raise Exception(f"Missing key '{key}'")

      value.validate(obj.get(key))

  def __repr__(self):
    return "{ " + ", ".join([f"'{key}': {value}" for key, value in self._dict.items()]) + " }"


class And:
  def __init__(self, *args):
    self._args = [Schema(arg) for arg in args]

  def transform(self, value):
    return None

  def validate(self, value):
    for arg in self._args:
      arg.validate(value)

class Or:
  def __init__(self, *args):
    assert(args)
    self._args = [Schema(arg) for arg in args]

  def transform(self, value):
    for arg in self._args:
      transformed = arg.transform(value)

      if transformed is not None:
        return transformed

    return None

  def validate(self, value):
    exception = None

    for arg in self._args:
      try:
        arg.validate(value)
        return
      except Exception as e:
        if not exception:
          exception = e

    raise exception

class Use:
  def __init__(self, validator):
    self._validator = validator

  def validate(self, value):
    self._validator(value)

class Optional:
  def __init__(self, arg):
    self._arg = Schema(arg)

  def transform(self, value):
    return self._arg.transform(value) if value is not None else None

  def validate(self, value):
    if value is not None:
      self._arg.validate(value)

  def __repr__(self):
    return f"Optional({self._arg})"

class List(SchemaType):
  def __init__(self, arg):
    super().__init__(list)
    self._arg = Schema(arg)

  def transform(self, value):
    super().validate(value)

    output = list(value)

    for index, item in enumerate(value):
      transformed = self._arg.transform(item)

      if transformed is not None:
        output[index] = transformed
      else:
        self._arg.validate(item)

    return output

  def validate(self, value):
    super().validate(value)

    for item in value:
      self._arg.validate(item)

  def __repr__(self):
    return f"List({self._arg})"

class Array(SchemaType):
  def __init__(self, arg):
    super().__init__(list)
    self._arg = [Schema(item) for item in arg]

  def transform(self, value):
    super().validate(value)

    if len(value) != len(self._arg):
      raise Exception(f"Invalid number of items, found {len(value)}, expected {len(self._arg)}")

    output = list(value)

    for index, (provided, expected) in enumerate(zip(value, self._arg)):
      transformed = expected.transform(provided)

      if transformed is not None:
        output[index] = transformed
      else:
        expected.validate(provided)

    return output

  def validate(self, value):
    super().validate(value)

    if len(value) != len(self._arg):
      raise Exception(f"Invalid number of items, found {len(value)}, expected {len(self._arg)}")

    for provided, expected in zip(value, self._arg):
      expected.validate(provided)

  def __repr__(self):
    return "[" + ", ".join([str(item) for item in self._arg]) + "]"

class ParseType(SchemaType):
  def transform(self, value):
    if self._exptype == bool:
      if (value == "true") or (value == "false"):
        return value == "true"
    elif self._exptype == int:
      try:
        return int(value)
      except:
        pass

    return None


if __name__ == "__main__":
  s = Schema({
    'foo': Array([ParseType(Or(bool, int)), Or(ParseType(bool), ParseType(int))])
  })

  f = s.transform({
    'foo': ['true', '42']
  })

  print(f)

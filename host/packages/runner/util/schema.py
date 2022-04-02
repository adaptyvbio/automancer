from venv import create
from ..reader import LocatedValue


def create_error(obj, message):
  if isinstance(obj, LocatedValue):
    return obj.error(message)
  else:
    return Exception(message)


# Entry point for creating schemas for values provided by the user.
def Schema(schema_like):
  if type(schema_like) == dict:
    return SchemaDict(schema_like)
  if callable(schema_like):
    return SchemaType(schema_like)
  if type(schema_like) in [type(None), int, str]:
    return Exact(schema_like)

  return schema_like



## Schema components ##########


# SchemaType - Primitive type (e.g. int, list, str)
# Examples
#   SchemaType(str)
#   SchemaType(int)

class SchemaType:
  def __init__(self, type):
    self._type = type

  def transform(self, obj):
    pass

  def validate(self, test):
    if isinstance(test, LocatedValue):
      if type(test.value) != self._type:
        raise test.error(f"Invalid type '{type(test.value).__name__}', expected '{self._type.__name__}'")
    elif type(test) != self._type:
      raise Exception(f"Invalid type '{type(test).__name__}', expected '{self._type.__name__}'")

  def __repr__(self):
    return f"<{self._type.__name__}>"


# SchemaDict - Dictionary with fixed keys
# Example
#   SchemaDict({ 'foo': str })

class SchemaDict(SchemaType):
  def __init__(self, raw_dict, *, allow_extra = True):
    super().__init__(dict)

    self._allow_extra = allow_extra
    self._dict = { key: Schema(value) for key, value in raw_dict.items() }

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

  def validate(self, test):
    super().validate(test)

    for key, value in self._dict.items():
      if not (key in test):
        raise create_error(test, f"Missing key '{key}'")

      value.validate(test[key])

    if not self._allow_extra:
      for key in test.keys():
        if not (key in self._dict):
          raise create_error(key, f"Extraneous key '{key}'")

  def __repr__(self):
    return "{ " + ", ".join([f"'{key}': {value}" for key, value in self._dict.items()]) + " }"


# FreeDict
# Examples
#   FreeDict({ 34: 'foo', int: str })
#   FreeDict({ Optional(34): 'foo', int: str })

class FreeDict(SchemaType):
  def __init__(self, raw_dict, *, allow_extra = True):
    super().__init__(dict)

    self._dict = { Schema(key): Schema(value) for key, value in raw_dict.items() }

    if allow_extra:
      self._dict[Any()] = Any()

  def validate(self, test):
    super().validate(test)

    for test_key, test_value in test.items():
      for key, value in self._dict.items():
        try:
          key.validate(test_key)
        except:
          continue

        value.validate(test_value)
        break
      else:
        raise create_error(test, f"Extraneous key {key}")

    for key, value in self._dict.items():
      if isinstance(key, Exact):
        if not (key._value in test):
          raise create_error(test, f"Missing key {key}")

  def __repr__(self):
    return "{ " + ", ".join([f"{key}: {value}" for key, value in self._dict.items()]) + " }"


# Dict
# Example
#   Dict(str, int)

class Dict(FreeDict):
  def __init__(self, key, value, *, allow_extra=True):
    super().__init__({ key: value }, allow_extra=allow_extra)


# Any

class Any:
  def validate(self, test):
    pass

  def __repr__(self):
    return "<any>"


# Never

class Never:
  def validate(self, test):
    raise create_error(test, "Invalid value")

  def __repr__(self):
    return "<never>"


# Exact - Exact value
# Examples
#   Exact(34)
#   Exact('foo')

class Exact:
  def __init__(self, value):
    self._value = value

  def validate(self, test):
    if test != self._value:
      raise create_error(test, f"Invalid value {repr(test)}, expected {repr(self._value)}")

  def __repr__(self):
    return repr(self._value)


# And - Intersection type between two or more types
# Example
#   And(str, Use(identifier))

class And:
  def __init__(self, *atoms):
    self._atoms = [Schema(atom) for atom in atoms]

  def transform(self, value):
    return None

  def validate(self, test):
    for atom in self._atoms:
      atom.validate(test)

  def __repr__(self):
    return "(" + " & ".join([str(atom) for atom in self._atoms]) + ")"


# Or - Union type between two or more types
# Examples
#   Or(str, int)

class Or:
  def __init__(self, *atoms):
    assert(atoms)
    self._atoms = [Schema(atom) for atom in atoms]

  def transform(self, value):
    for atom in self._atoms:
      transformed = atom.transform(value)

      if transformed is not None:
        return transformed

    return None

  def validate(self, value):
    exception = None

    for atom in self._atoms:
      try:
        atom.validate(value)
        return
      except Exception as e:
        if not exception:
          exception = e

    raise exception

  def __repr__(self):
    return "(" + " | ".join([str(atom) for atom in self._atoms]) + ")"


# Use - External validator
# Example
#   Use(lambda x: x > 5)
#   Use(lambda x: func_that_raises())

class Use:
  def __init__(self, validator, message = "Invalid value"):
    self._message = message
    self._validator = validator

  def validate(self, test):
    result = self._validator(test)

    if result == False:
      raise create_error(test, self._message)

  def __repr__(self):
    return f"<{self._validator.__name__}>"


class Transform:
  def __init__(self, transform, *, prevalidate = None):
    self._prevalidate = Schema(prevalidate) if prevalidate else None
    self._transform = transform

  def transform(self, value):
    if self._prevalidate:
      self._prevalidate.validate(value)

    return self._transform(value)

  def validate(self, value):
    pass


class Noneable(Or):
  def __init__(self, schema_like):
    super().__init__(schema_like, None)

  # def transform(self, value):
  #   return self._arg.transform(value) if value is not None else None

  # def validate(self, test):
  #   if value is not None:
  #     self._schema.validate(test)

  # def __repr__(self):
  #   return f"Optional({self._arg})"


class Optional:
  def __init__(self, schema_like):
    self._schema = Schema(schema_like)

  def validate(self, test):
    self._schema.validate(test)

  def __repr__(self):
    return f"{repr(self._schema)}?"


# List

class List(SchemaType):
  def __init__(self, schema_like):
    super().__init__(list)
    self._schema = Schema(schema_like)

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

  def validate(self, test):
    super().validate(test)

    for item in test:
      self._schema.validate(item)

  def __repr__(self):
    return f"[{self._schema} ...]"


# Tuple

class Tuple(SchemaType):
  def __init__(self, items):
    super().__init__(list)
    self._tuple = [Schema(item) for item in items]

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

  def validate(self, test):
    super().validate(test)

    if len(test) != len(self._tuple):
      raise Exception(f"Invalid number of items, found {len(test)}, expected {len(self._tuple)}")

    for test_item, item in zip(test, self._tuple):
      item.validate(test_item)

  def __repr__(self):
    return "[" + ", ".join([str(item) for item in self._tuple]) + "]"

# class Dict(SchemaType):
#   def __init__(self, key, value):
#     super().__init__(dict)
#     self._key = Schema(key)
#     self._value = Schema(value)

#   def validate(self, obj):
#     super().validate(obj)

#     for key, value in obj.items():
#       self._key.validate(key)
#       self._value.validate(value)

#   def __repr__(self):
#     return f"{{ [{self._key}]: {self._value} }}"


# Sequence

class Sequence:
  pass


class ParseType(SchemaType):
  def transform(self, value):
    if self._type == bool:
      if (value == "true") or (value == "false"):
        return value == "true"
    elif self._type == int:
      try:
        return int(value)
      except:
        pass

    return None


if __name__ == "__main__":
  from .. import reader

  s = Schema({
    # 'foo': Array([ParseType(Or(bool, int)), Or(ParseType(bool), ParseType(int))])
    'foo': int,
    'bar': {
      'x': And(int, Or(34, 35)),
      'y': Use(lambda x: x > 5)
    },
    'baz': FreeDict({
      Optional('a'): 'b',
      's': List(15),
      Any(): Noneable(Tuple([3, 4, int]))
    })
  })

  t = reader.parse("""
x: 5
y: 4
  """)

  t = {
    'foo': 4,
    'bar': {
      'x': 34,
      'y': 16
    },
    'baz': {
      # 'a': 'b',
      's': [15, 15],
      'p': [3, 4, 9]
    }
  }

  print(s)

  try:
    s.validate(t)
  except reader.LocatedError as e:
    e.display()

  # f = s.transform({
  #   'foo': ['true', '42']
  # })

  # print(f)

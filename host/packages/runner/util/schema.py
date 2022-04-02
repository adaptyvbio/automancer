from ..reader import LocatedValue


def create_error(obj, message):
  if isinstance(obj, LocatedValue):
    return obj.error(message)
  else:
    return Exception(message)


# Entry point for creating schemas for values provided by the user.
def Schema(schema_like):
  if type(schema_like) == dict:
    return Dict(schema_like)
  if callable(schema_like):
    return SchemaType(schema_like)
  if type(schema_like) in [type(None), int, str]:
    return Exact(schema_like)

  return schema_like


class Invariant:
  def transform(self, test):
    self.validate(test)
    return test



## Schema components ##########


# SchemaType - Primitive type (e.g. int, list, str)
# Examples
#   SchemaType(str)
#   SchemaType(int)

class SchemaType(Invariant):
  def __init__(self, type):
    self._type = type

  def validate(self, test):
    if isinstance(test, LocatedValue):
      if type(test.value) != self._type:
        raise test.error(f"Invalid type '{type(test.value).__name__}', expected '{self._type.__name__}'")
    elif type(test) != self._type:
      raise Exception(f"Invalid type '{type(test).__name__}', expected '{self._type.__name__}'")

  def __repr__(self):
    return f"<{self._type.__name__}>"


# Dict
# Examples
#   Dict({ 34: 'foo', int: str })
#   Dict({ Optional(34): 'foo', int: str })

class Dict(SchemaType):
  def __init__(self, raw_dict, *, allow_extra = False):
    super().__init__(dict)

    self._dict = { Schema(key): Schema(value) for key, value in raw_dict.items() }

    if allow_extra:
      self._dict[Any()] = Any()

  def transform(self, test):
    super().validate(test)
    output = dict()

    for test_key, test_value in test.items():
      for key, value in self._dict.items():
        try:
          new_key = key.transform(test_key)
        except:
          continue

        new_value = value.transform(test_value)
        output[new_key] = new_value
        break
      else:
        raise create_error(test, f"Extraneous key {repr(test_key)}")

    for key, value in self._dict.items():
      if isinstance(key, Exact) and (not isinstance(value, Optional)):
        if not (key._value in test):
          raise create_error(test, f"Missing key {key}")

    return output

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
        raise create_error(test, f"Extraneous key {repr(test_key)}")

    for key, value in self._dict.items():
      if isinstance(key, Exact) and (not isinstance(value, Optional)):
        if not (key._value in test):
          raise create_error(test, f"Missing key {key}")

  def __repr__(self):
    return "{ " + ", ".join([f"{key}: {value}" for key, value in self._dict.items()]) + " }"


# SimpleDict
# Example
#   SimpleDict(str, int)

class SimpleDict(Dict):
  def __init__(self, key, value, *, allow_extra = False):
    super().__init__({ key: value }, allow_extra=allow_extra)


# Any

class Any(Invariant):
  def validate(self, test):
    pass

  def __repr__(self):
    return "<any>"


# Never

class Never(Invariant):
  def validate(self, test):
    raise create_error(test, "Invalid value")

  def __repr__(self):
    return "<never>"


# Exact - Exact value
# Examples
#   Exact(34)
#   Exact('foo')

class Exact(Invariant):
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

  def transform(self, test):
    for atom in self._atoms:
      try:
        return atom.transform(test)
      except:
        pass

    # Should raise
    self.validate(test)

  def validate(self, test):
    exception = None

    for atom in self._atoms:
      try:
        atom.validate(test)
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


# Transform

class Transform(Never):
  def __init__(self, transform, schema_like = Any()):
    self._schema = Schema(schema_like)
    self._transform = transform

  def transform(self, test):
    self._schema.validate(test)
    return self._transform(test)


# Noneable

class Noneable(Or):
  def __init__(self, schema_like):
    super().__init__(schema_like, None)


# Optional

class Optional:
  def __init__(self, schema_like):
    self._schema = Schema(schema_like)

  def transform(self, test):
    return self._schema.transform(test)

  def validate(self, test):
    self._schema.validate(test)

  def __repr__(self):
    return f"{repr(self._schema)}?"


# List

class List(SchemaType):
  def __init__(self, schema_like):
    super().__init__(list)
    self._schema = Schema(schema_like)

  def transform(self, test):
    super().validate(test)
    return [self._schema.transform(item) for item in test]

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

  def transform(self, test):
    super().validate(test)

    if len(test) != len(self._tuple):
      raise create_error(test, f"Invalid number of items, found {len(test)}, expected {len(self._tuple)}")

    return [item.transform(test_item) for test_item, item in zip(test, self._tuple)]

  def validate(self, test):
    super().validate(test)

    if len(test) != len(self._tuple):
      raise create_error(test, f"Invalid number of items, found {len(test)}, expected {len(self._tuple)}")

    for test_item, item in zip(test, self._tuple):
      item.validate(test_item)

  def __repr__(self):
    return "[" + ", ".join([str(item) for item in self._tuple]) + "]"


# ParseType

class ParseType(SchemaType):
  def transform(self, test):
    if self._type == bool:
      if (test == "true") or (test == "false"):
        return test == "true"
    elif self._type == int:
      try:
        return int(test)
      except:
        pass

    super().validate(test)
    return test


## Tests ####

if __name__ == "__main__":
  from .. import reader

  s = Schema({
    # 'foo': Array([ParseType(Or(bool, int)), Or(ParseType(bool), ParseType(int))])
    # ParseType(int): Or(ParseType(int), ParseType(bool))
    # 'foo': Or(bool, Transform(lambda x: str(x) * 2, int))
    # 'bar': Tuple([ParseType(int), str])
    Optional('foo'): int,
    'bar': Optional(int)
  })

  t = {

  }

  try:
    print(s.transform(t))
  except reader.LocatedError as e:
    e.display()

  # f = s.transform({
  #   'foo': ['true', '42']
  # })

  # print(f)

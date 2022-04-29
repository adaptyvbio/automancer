from collections import namedtuple
import math
import sys


Position = namedtuple("Position", ["line", "column"])

class Location:
  def __init__(self, source, start, end):
    self.end = end
    self.source = source
    self.start = start

  def __mod__(self, offset):
    start, end = offset if isinstance(offset, tuple) else (offset, offset + 1)

    return Location(
      source=self.source,
      start=(self.start + start),
      end=(self.start + end)
    )

  def __add__(self, other):
    return Location(
      source=self.source,
      start=min(self.start, other.start),
      end=max(self.end, other.end)
    )

  def __repr__(self):
    return f"Range({self.start} -> {self.end})"

  @property
  def start_position(self):
    return self.source.offset_position(self.start)

  @property
  def end_position(self):
    return self.source.offset_position(self.end)

  def full_string(source, value):
    return Location(source, 0, len(value))


class LocatedError(Exception):
  def __init__(self, message, location):
    super().__init__(message)
    self.location = location

  # TODO: improve by trying to find block limits
  def display(self, file=sys.stderr, *,
    context_after = 2,
    context_before = 4,
    target_space = False
  ):
    print(self, file=file)

    start = self.location.start_position
    end = self.location.end_position

    if (start.line == end.line) and (start.column == end.column):
      end = Position(end.line, end.column + 1)

    lines = self.location.source.splitlines()
    width_line = math.ceil(math.log(end.line + 1 + context_after + 1, 10))
    end_line = end.line - (1 if end.column == 0 else 0)

    for line_index, line in enumerate(lines):
      if (line_index < start.line - context_before) or (line_index > end_line + context_after):
        continue

      print(f" {str(line_index + 1).rjust(width_line, ' ')} | {line}", file=file)

      if (line_index >= start.line) and (line_index <= end_line):
        target_offset = start.column if line_index == start.line else 0
        target_width = (end.column if line_index == end.line else len(line))\
          - (start.column if line_index == start.line else 0)

        if not target_space:
          target_line = line[target_offset:(target_offset + target_width)]
          target_space_width = len(target_line) - len(target_line.lstrip())

          if target_space_width < target_width:
            target_offset += target_space_width
            target_width -= target_space_width

        print(
          " " +
          " " * width_line +
          " | "
          "\033[31m" +
          " " * target_offset +
          "^" * target_width +
          "\033[39m",
          file=file
        )


class LocatedValue:
  def __init__(self, value, location):
    self.location = location
    self.value = value

  def error(self, message):
    return LocatedError(message, self.location)

  def create_error(message, object):
    if isinstance(object, LocatedValue):
      return object.error(message)
    else:
      return Exception(message)

  def extract(object):
    if isinstance(object, LocatedValue):
      return object.value
    else:
      return object

  def locate(object, location):
    if isinstance(object, dict):
      return LocatedDict(object, location)
    elif isinstance(object, list):
      return LocatedList(object, location)
    elif isinstance(object, str):
      return LocatedString(object, location)
    else:
      return object

  def transfer(dest, source):
    if (not isinstance(dest, LocatedValue)) and isinstance(source, LocatedValue):
      return LocatedValue.locate(dest, source.location)

    return dest


class LocatedString(str, LocatedValue):
  def __new__(cls, value, *args, **kwargs):
    return super(LocatedString, cls).__new__(cls, value)

  def __init__(self, value, location, *, symbolic = False):
    LocatedValue.__init__(self, value, location)
    self.symbolic = symbolic
    # str.__init__(self)

  def __getitem__(self, key):
    if isinstance(key, slice):
      start, stop, step = key.indices(len(self))
      return LocatedString(self.value[key], (self.location % (start, stop)) if not self.symbolic else self.location)
    else:
      return self[key:(key + 1)]

  def split(self, sep, maxsplit = -1):
    if sep is None:
      raise Exception("Not supported")

    index = 0

    def it(frag):
      nonlocal index

      value = self[index:(index + len(frag))]
      index += len(frag) + len(sep)
      return value

    fragments = self.value.split(sep, maxsplit)
    return [it(frag) for frag in fragments]

  def splitlines(self):
    indices = [index for index, char in enumerate(self.value) if char == "\n"]
    return [self[((a + 1) if a is not None else a):b] for a, b in zip([None, *indices], [*indices, None])]

  def rstrip(self):
    stripped = self.value.rstrip()
    return self[0:len(stripped)]


class LocatedDict(dict, LocatedValue):
  def __new__(cls, *args, **kwargs):
    return super(LocatedDict, cls).__new__(cls)

  def __init__(self, value, location):
    LocatedValue.__init__(self, value, location)
    self.update(value)


class LocatedList(list, LocatedValue):
  def __new__(cls, *args, **kwargs):
    return super(LocatedList, cls).__new__(cls)

  def __init__(self, value, location):
    LocatedValue.__init__(self, value, location)
    self += value


class Source(LocatedString):
  # def __new__(cls, value, *args, **kwargs):
  #   return super(Source, cls).__new__(cls, value)

  def __init__(self, value):
    super().__init__(value, Location.full_string(self, value))
    # print(">>", self.range)

  def offset_position(self, offset):
    line = self.value[:offset].count("\n")
    column = (offset - self.value[:offset].rindex("\n") - 1) if line > 0 else offset

    return Position(line, column)



# a: b      key: 'a',   value: 'b',   list: False
# a:        key: 'a',   value: None,  list: False
# - a:      key: 'a',   value: None,  list: True
# - a: b    key: 'a',   value: 'b',   list: True
# - b       key: None,  value: 'b',   list: True


def tokenize(raw_source):
  source = Source(raw_source)
  tokens = list()

  for line_index, line in enumerate(source.splitlines()):
    comment_offset = line.find("#")

    if comment_offset >= 0:
      line = line[0:comment_offset]

    line = line.rstrip()
    end_offset = len(line)
    indent_offset = len(line) - len(line.lstrip())

    if indent_offset % 2 > 0:
      raise line.error("Invalid indentation")

    if len(line) == indent_offset:
      continue

    offset = indent_offset
    token = {
      'depth': indent_offset // 2,
      'key': None,
      'value': None,
      'list': False,
      'data': line[offset:]
    }

    tokens.append(token)

    if line[offset] == "-":
      offset = get_offset(line, offset)
      token['list'] = True


    colon_offset = line.find(":", offset)
    if colon_offset >= 0:
      key = line[offset:colon_offset].rstrip()
      value_offset = get_offset(line, colon_offset)
      value = line[value_offset:]

      if len(key) < 1:
        raise Exception()

      token.update({
        'key': key,
        'value': value if value else None
      })
    elif token['list']:
      token['value'] = line[offset:]
    else:
      raise token['data'].error("Invalid token")

  return tokens


def analyze(tokens):
  stack = [
    { 'mode': 'dict', 'location': None, 'value': dict() }
  ]

  def add_location(item):
    if item['location']:
      if item['mode'] == 'dict':
        return LocatedDict(item['value'], item['location'])
      if item['mode'] == 'list':
        return LocatedList(item['value'], item['location'])

    return item['value']


  def descend(new_depth):
    while len(stack) - 1 > new_depth:
      add = stack.pop()
      add_value = add_location(add)
      head = stack[-1]

      if head['mode'] == 'dict':
        head['value'][add['key']] = add_value
      elif head['mode'] == 'list':
        head['value'].append(add_value)

      if add['location']:
        if not head['location']:
          head['location'] = add['location']
        else:
          head['location'] += add['location']

  for token in tokens:
    depth = len(stack) - 1

    if token['depth'] > depth:
      raise token['data'].error("Invalid indentation")
    if token['depth'] < depth:
      descend(token['depth'])

    head = stack[-1]

    if not head['mode']:
      if token['list']:
        head.update({ 'mode': 'list', 'value': list() })
      else:
        head.update({ 'mode': 'dict', 'value': dict() })

    if head['mode'] == 'dict':
      if token['list']:
        raise token['data'].error("Invalid token")
      if token['key'] in head['value']:
        raise token['key'].error(f"Duplicate key '{token['key']}'")

      if token['value']:
        head['value'][token['key']] = token['value']
      else:
        stack.append({
          'mode': None,
          'location': None,
          'key': token['key'],
          'value': None
        })

    elif head['mode'] == 'list':
      if not token['list']:
        raise token['data'].error("Invalid token")

      if token['key']:
        if token['value']:
          stack.append({
            'mode': 'dict',
            'location': token['key'].location + token['value'].location,
            'key': None,
            'value': { token['key']: token['value'] }
          })
        else:
          stack.append({
            'mode': 'dict',
            'location': token['key'].location,
            'key': None,
            'value': dict()
          })

          stack.append({
            'mode': None,
            'location': None,
            'key': token['key'],
            'value': None
          })
      else:
        head['value'].append(token['value'])

    if not head['location']:
      head['location'] = token['data'].location
    else:
      head['location'] += token['data'].location

  descend(0)

  return add_location(stack[0])


def get_offset(line, origin):
  return origin + len(line[(origin + 1):]) - len(line[(origin + 1):].lstrip()) + 1



def parse(raw_source):
  return analyze(tokenize(raw_source))


def dumps(obj, depth = 0, cont = True):
  if isinstance(obj, dict):
    output = str()

    for index, (key, value) in enumerate(obj.items()):
      output += (str() if cont and (index < 1) else f"\n{'  ' * depth}") + f"{key}: {dumps(value, depth + 1, False)}"

    return output

  if isinstance(obj, list):
    output = str()

    for item in obj:
      output += f"\n{'  ' * depth}- {dumps(item, depth + 1, True)}"

    return output


  return str(obj)


def loads(raw_source):
  return analyze(tokenize(raw_source))


# create_error = LocatedValue.create_error


if __name__ == "__main__":
  x = parse("""
foo:
  - bar
  - baz:
      - foo
      - p: x
        s: a
    s: n
  - f
""")

  print(x)

  LocatedError("Error", x.location).display()
  LocatedError("Error", x['foo'].location).display()
  LocatedError("Error", x['foo'][1].location).display()
  LocatedError("Error", x['foo'][1]['baz'].location).display()
  LocatedError("Error", x['foo'][1]['baz'][1].location).display()

  # print(dumps({
  #   'foo': 'bar',
  #   'baz': 42,
  #   'x': [3, 4, {
  #     'y': 'p',
  #     'z': 'x'
  #   }],
  #   'a': [[3, 4], [5, 6]]
  # }))

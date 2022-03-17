from collections import namedtuple
import math


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
  def display(self):
    start = self.location.start_position
    end = self.location.end_position

    if (start.line == end.line) and (start.column == end.column):
      end = Position(end.line, end.column + 1)

    # Options
    context_before = 4
    context_after = 2
    target_space = False

    lines = self.location.source.splitlines()
    width_line = math.ceil(math.log(end.line + 1 + context_after + 1, 10))
    end_line = end.line - (1 if end.column == 0 else 0)

    for line_index, line in enumerate(lines):
      if (line_index < start.line - context_before) or (line_index > end_line + context_after):
        continue

      print(f" {str(line_index + 1).rjust(width_line, ' ')} | {line}")

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
          "\033[39m"
        )


class LocatedValue:
  def __init__(self, value, location):
    self.location = location
    self.value = value

  def error(self, message):
    return LocatedError(message, self.location)


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


class LocatedList(list, LocatedValue):
  def __new__(cls, *args, **kwargs):
    return super(LocatedList, cls).__new__(cls)

  def __init__(self, location):
    LocatedValue.__init__(self, self, location)


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
  origin = dict()
  stack = [
    { 'mode': 'dict', 'value': origin }
  ]

  def descend(new_depth):
    while len(stack) - 1 > new_depth:
      add = stack.pop()
      head = stack[-1]

      if head['mode'] == 'dict':
        head['value'][add['key']] = add['value']
      elif head['mode'] == 'list':
        head['value'].append(add['value'])

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
            'key': None,
            'value': { token['key']: token['value'] }
          })
        else:
          stack.append({
            'mode': 'dict',
            'key': None,
            'value': dict()
          })

          stack.append({
            'mode': None,
            'key': token['key'],
            'value': None
          })
      else:
        head['value'].append(token['value'])

  descend(0)

  return origin


def get_offset(line, origin):
  return origin + len(line[(origin + 1):]) - len(line[(origin + 1):].lstrip()) + 1



def parse(raw_source):
  return analyze(tokenize(raw_source))

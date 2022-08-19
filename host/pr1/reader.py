from collections import namedtuple
import math
import sys


Position = namedtuple("Position", ["line", "column"])

class Location:
  def __init__(self, source, offset):
    self.source = source
    self.offset = offset

  @property
  def start_position(self):
    return self.source.offset_position(self.offset)

  @property
  def end_position(self):
    return self.source.offset_position(self.offset)

class LocationRange:
  def __init__(self, source, start, end):
    self.end = end
    self.source = source
    self.start = start

  def __mod__(self, offset):
    start, end = offset if isinstance(offset, tuple) else (offset, offset + 1)

    return LocationRange(
      source=self.source,
      start=(self.start + start),
      end=(self.start + end)
    )

  def __add__(self, other):
    return LocationRange(
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

  def location(self):
    assert self.start == self.end
    return Location(self.source, offset=self.start)

  def full_string(source, value):
    return LocationRange(source, 0, len(value))


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
  def __init__(self, value, locrange):
    self.locrange = locrange
    self.value = value

  def error(self, message):
    return LocatedError(message, self.locrange)

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

  def locate(object, locrange):
    if isinstance(object, dict):
      return LocatedDict(object, locrange)
    elif isinstance(object, list):
      return LocatedList(object, locrange)
    elif isinstance(object, str):
      return LocatedString(object, locrange)
    else:
      return object

  def transfer(dest, source):
    if (not isinstance(dest, LocatedValue)) and isinstance(source, LocatedValue):
      return LocatedValue.locate(dest, source.locrange)

    return dest


class LocatedString(str, LocatedValue):
  def __new__(cls, value, *args, **kwargs):
    return super(LocatedString, cls).__new__(cls, value)

  def __init__(self, value, locrange, *, symbolic = False):
    LocatedValue.__init__(self, value, locrange)
    self.symbolic = symbolic
    # str.__init__(self)

  def __getitem__(self, key):
    if isinstance(key, slice):
      start, stop, step = key.indices(len(self))
      return LocatedString(self.value[key], (self.locrange % (start, stop)) if not self.symbolic else self.locrange)
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

  def strip(self):
    return self.lstrip().rstrip()

  def lstrip(self):
    stripped = self.value.lstrip()
    return self[(len(self) - len(stripped)):]

  def rstrip(self):
    stripped = self.value.rstrip()
    return self[0:len(stripped)]


class LocatedDict(dict, LocatedValue):
  def __new__(cls, *args, **kwargs):
    return super(LocatedDict, cls).__new__(cls)

  def __init__(self, value, locrange):
    LocatedValue.__init__(self, value, locrange)
    self.update(value)


class LocatedList(list, LocatedValue):
  def __new__(cls, *args, **kwargs):
    return super(LocatedList, cls).__new__(cls)

  def __init__(self, value, locrange):
    LocatedValue.__init__(self, value, locrange)
    self += value


class Source(LocatedString):
  # def __new__(cls, value, *args, **kwargs):
  #   return super(Source, cls).__new__(cls, value)

  def __init__(self, value):
    super().__init__(value, LocationRange.full_string(self, value))
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


class ReaderException(Exception):
  pass

class InvalidIndentationException(ReaderException):
  def __init__(self, target):
    self.target = target

class MissingKeyException(ReaderException):
  def __init__(self, location):
    self.location = location

class InvalidLineException(ReaderException):
  def __init__(self, target):
    self.target = target


def tokenize(raw_source):
  errors = list()

  source = Source(raw_source)
  tokens = list()

  for line in source.splitlines():
    comment_offset = line.find("#")

    if comment_offset >= 0:
      line = line[0:comment_offset]

    line = line.rstrip()
    indent_offset = len(line) - len(line.lstrip())

    if indent_offset % 2 > 0:
      errors.append(InvalidIndentationException(line[indent_offset:]))
      continue

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

    if line[offset] == "-":
      offset = get_offset(line, offset)
      token['list'] = True


    colon_offset = line.find(":", offset)

    if colon_offset >= 0:
      key = line[offset:colon_offset].rstrip()
      value_offset = get_offset(line, colon_offset)
      value = line[value_offset:]

      if len(key) < 1:
        errors.append(MissingKeyException(location=key.locrange.location()))
        continue

      token.update({
        'key': key,
        'value': value if value else None
      })
    elif token['list']:
      token['value'] = line[offset:]
    else:
      errors.append(InvalidLineException(token['data']))

    tokens.append(token)

  return tokens, errors


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
            'location': token['key'].locrange + token['value'].locrange,
            'key': None,
            'value': { token['key']: token['value'] }
          })
        else:
          stack.append({
            'mode': 'dict',
            'location': token['key'].locrange,
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
      head['location'] = token['data'].locrange
    else:
      head['location'] += token['data'].locrange

  descend(0)

  return add_location(stack[0])


def get_offset(line, origin):
  return origin + len(line[(origin + 1):]) - len(line[(origin + 1):].lstrip()) + 1



def parse(raw_source):
  tokens, errors = tokenize(raw_source)

  if errors:
    raise errors[0]

  return analyze(tokens)


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

  if isinstance(obj, bool):
    return "true" if obj else "false"


  return str(obj)


def loads(raw_source):
  return analyze(tokenize(raw_source))


# create_error = LocatedValue.create_error

def format_source(
  locrange,
  *,
  context_after = 2,
  context_before = 4,
  target_space = False
):
  output = str()

  start = locrange.start_position
  end = locrange.end_position

  if (start.line == end.line) and (start.column == end.column):
    end = Position(end.line, end.column + 1)

  lines = locrange.source.splitlines()
  width_line = math.ceil(math.log(end.line + 1 + context_after + 1, 10))
  end_line = end.line - (1 if end.column == 0 else 0)

  for line_index, line in enumerate(lines):
    if (line_index < start.line - context_before) or (line_index > end_line + context_after):
      continue

    output += f" {str(line_index + 1).rjust(width_line, ' ')} | {line}\n"

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

      output += " " + " " * width_line + " | " "\033[31m" + " " * target_offset + "^" * target_width + "\033[39m" + "\n"

  return output


if __name__ == "__main__":
  tokens, errors = tokenize(f"""
foo:
  - bar: 34
    pp:
      - foo
      - p: x
        s: a
    s: n
  - f
  """)
  # except LocatedError as e:
  #   e.display()

  from pprint import pprint

  pprint(tokens)
  print()
  pprint(errors)

  # print(errors[0].target.locrange)
  # print(format_source(errors[0].target.locrange))
  # print(format_source(errors[0].location))

  # LocatedError("Error", x.location).display()
  # LocatedError("Error", x['foo'].location).display()
  # LocatedError("Error", x['foo'][1].location).display()
  # LocatedError("Error", x['foo'][1]['baz'].location).display()
  # LocatedError("Error", x['foo'][1]['baz'][1].location).display()

  # print(dumps({
  #   'foo': 'bar',
  #   'baz': 42,
  #   'x': [3, 4, {
  #     'y': 'p',
  #     'z': 'x'
  #   }],
  #   'a': [[3, 4], [5, 6]]
  # }))

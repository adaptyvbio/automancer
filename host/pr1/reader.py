from collections import namedtuple
import math
import sys
from enum import Enum

from .draft import DraftDiagnostic
from .util.decorators import deprecated


Position = namedtuple("Position", ["line", "column"])

class Location:
  def __init__(self, source, offset):
    self.source = source
    self.offset = offset

  @property
  def start(self):
    return self.offset

  @property
  def end(self):
    return self.offset + 1

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

  @deprecated
  def __add__(self, other):
    return LocationRange(
      source=self.source,
      start=min(self.start, other.start),
      end=max(self.end, other.end)
    )

  def __lt__(self, other):
    return (self.start < other.start) or ((self.start == other.start) and (self.end < other.end))

  def __repr__(self):
    return f"LocationRange({self.start} -> {self.end})"

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

class LocationArea:
  def __init__(self, ranges = list()):
    self.ranges = ranges

  def location(self):
    assert len(self.ranges) == 1
    return self.ranges[0].location()

  def format(self):
    output = str()

    if not self.ranges:
      return output

    source = self.ranges[0].source
    lines_source = source.splitlines()

    lines_ranges = dict()

    for locrange in self.ranges:
      start = locrange.start_position
      end = locrange.end_position

      for line_index in range(start.line, end.line + (1 if end.column > 0 else 0)):
        if not (line_index in lines_ranges):
          lines_ranges[line_index] = list()

        lines_ranges[line_index].append(range(
          start.column if line_index == start.line else 0,
          end.column if line_index == end.line else len(lines_source[line_index]) + 1
        ))

    lines_list = sorted(lines_ranges.keys())

    width_line = math.ceil(math.log(lines_list[-1] + 2, 10))

    for index, line_index in enumerate(lines_list):
      line_source = lines_source[line_index]

      if (index > 0) and (line_index != (lines_list[index - 1] + 1)):
        output += "\n"

      output += f" {str(line_index + 1).rjust(width_line, ' ')} | {line_source}\n"

      if line_index in lines_ranges:
        line_ranges = lines_ranges[line_index]

        output += f" {' ' * width_line} | " + "".join(
          [("-" if column_index == len(line_source) else "^") if any(
            [column_index in line_range for line_range in line_ranges]
          ) else " " for column_index in range(0, len(line_source) + 1)
        ]) + "\n"

    return output

  def __add__(self, other):
    ranges = (self.ranges + [other]) if isinstance(other, LocationRange) else (self.ranges + other.ranges)
    output = list()

    for range in sorted(ranges):
      if output and (output[-1].end >= range.start):
        output[-1].end = max(output[-1].end, range.end)
      else:
        output.append(LocationRange(range.source, range.start, range.end))

    # print(self, '+', other, '->', output)
    return LocationArea(output)

  def __mod__(self, offset):
    start, end = offset if isinstance(offset, tuple) else (offset, offset + 1)

    index = 0
    output = list()

    for range in self.ranges:
      range_start = index
      range_end = index + (range.end - range.start)

      delta_start = 0
      delta_end = 0

      if (start > range_start) and (start <= range_end):
        delta_start = range_start - start

      if (end >= range_start) and (end < range_end):
        delta_end = range_end - end

      if not ((end <= range_start) or (start >= range_end)):
        output.append(LocationRange(range.source, range.start - delta_start, range.end - delta_end))

      index += (range.end - range.start)

    # print(self.ranges, '->', output, start, end)

    return LocationArea(output)

  def __repr__(self):
    return "LocationArea(" + ", ".join([f"{range.start} -> {range.end}" for range in self.ranges]) + ")"


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
  def __init__(self, value, area):
    self.area = area
    self.value = value

  @deprecated
  def error(self, message):
    return LocatedError(message, self.area.ranges[0])

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

  def locate(object, area):
    if isinstance(object, dict):
      return LocatedDict(object, area)
    elif isinstance(object, list):
      return LocatedList(object, area)
    elif isinstance(object, str):
      return LocatedString(object, area)
    else:
      return object

  def transfer(dest, source):
    if (not isinstance(dest, LocatedValue)) and isinstance(source, LocatedValue):
      return LocatedValue.locate(dest, source.area)

    return dest


class LocatedValueContainer(LocatedValue):
  def __repr__(self):
    return repr(self.value)


class LocatedString(str, LocatedValue):
  def __new__(cls, value, *args, **kwargs):
    return super(LocatedString, cls).__new__(cls, value)

  def __init__(self, value, area, *, absolute = True):
    LocatedValue.__init__(self, value, area)
    self.absolute = absolute

  def __add__(self, other):
    other_located = isinstance(other, LocatedString)

    return LocatedString(
      self.value + str(other),
      self.area + other.area if other_located else self.area,
      absolute=(self.absolute and (other_located or (not other)))
    )

  def __getitem__(self, key):
    if isinstance(key, slice):
      if self.absolute:
        start, stop, step = key.indices(len(self))
        return LocatedString(self.value[key], self.area % (start, stop))
      else:
        return LocatedString(self.value[key], self.area, absolute=False)
    else:
      return self[key:(key + 1)] if key >= 0 else self[key:((key - 1) if key < -1 else None)]

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

  def splitlines(self, keepends = False):
    indices = [index for index, char in enumerate(self.value) if char == "\n"]
    return [self[((a + 1) if a is not None else a):((b + 1) if keepends and (b is not None) else b)] for a, b in zip([None, *indices], [*indices, None])]

  def strip(self, chars = None):
    return self.lstrip(chars).rstrip(chars)

  def lstrip(self, chars = None):
    stripped = self.value.lstrip(chars)
    return self[(len(self) - len(stripped)):]

  def rstrip(self, chars = None):
    stripped = self.value.rstrip(chars)
    return self[0:len(stripped)]


class LocatedDict(dict, LocatedValue):
  def __new__(cls, *args, **kwargs):
    return super(LocatedDict, cls).__new__(cls)

  def __init__(self, value, area):
    LocatedValue.__init__(self, value, area)
    self.update(value)

  def get_key(self, target):
    return next(key for key in self.keys() if key == target)


class LocatedList(list, LocatedValue):
  def __new__(cls, *args, **kwargs):
    return super(LocatedList, cls).__new__(cls)

  def __init__(self, value, area):
    LocatedValue.__init__(self, value, area)
    self += value


class Source(LocatedString):
  # def __new__(cls, value, *args, **kwargs):
  #   return super(Source, cls).__new__(cls, value)

  def __init__(self, value):
    super().__init__(value, LocationArea([LocationRange.full_string(self, value)]))

  def offset_position(self, offset):
    line = self.value[:offset].count("\n")
    column = (offset - self.value[:offset].rindex("\n") - 1) if line > 0 else offset

    return Position(line, column)


## Tokenization

# a: b      key: 'a',   value: 'b',   kind: Default
# a:        key: 'a',   value: None,  kind: Default
# - a:      key: 'a',   value: None,  kind: List
# - a: b    key: 'a',   value: 'b',   kind: List
# - b       key: None,  value: 'b',   kind: List
# | a       key: None, value: 'a',    kind: String

Whitespace = " "

class Token:
  def __init__(self, *, data, depth, key, kind, value):
    self.data = data
    self.depth = depth
    self.key = key
    self.kind = kind
    self.value = value

  def __repr__(self):
    return f"Token(depth={repr(self.depth)}, kind={repr(self.kind)}, key={repr(self.key)}, value={repr(self.value)})"

class TokenKind(Enum):
  Default = 0
  List = 1
  String = 2


class ReaderError(Exception):
  def diagnostic(self):
    return DraftDiagnostic("Unknown error")

class UnreadableIndentationError(ReaderError):
  def __init__(self, target):
    self.target = target

  def diagnostic(self):
    return DraftDiagnostic("Unreadable indentation", ranges=self.target.area.ranges)

class MissingKeyError(ReaderError):
  def __init__(self, location):
    self.location = location

  def diagnostic(self):
    return DraftDiagnostic("Missing key", ranges=[self.location])

class InvalidLineError(ReaderError):
  def __init__(self, target):
    self.target = target

  def diagnostic(self):
    return DraftDiagnostic("Invalid line", ranges=self.target.area.ranges)

class InvalidCharacterError(ReaderError):
  def __init__(self, target):
    self.target = target

  def diagnostic(self):
    return DraftDiagnostic("Invalid character", ranges=self.target.area.ranges)


def tokenize(raw_source):
  errors = list()
  warnings = list()

  source = Source(raw_source)
  tokens = list()


  # Check if all characters are ASCII

  for line in source.splitlines():
    if not is_basic_ascii(line):
      start_index = None

      for index, ch in enumerate(line):
        if is_basic_ascii(ch):
          if start_index is not None:
            warnings.append(InvalidCharacterError(line[start_index:index]))
            start_index = None
        else:
          if start_index is None:
            start_index = index

      if start_index is not None:
        warnings.append(InvalidCharacterError(line[start_index:]))


  # Iterate over all lines
  for full_line in source.splitlines(keepends=True):
    if full_line[-1] == "\n":
      line = full_line[:-1]
      line_break = full_line[-1]
    else:
      line = full_line
      line_break = str()

    # Remove the comment on the line, if any
    comment_offset = line.find("#")

    if comment_offset >= 0:
      line = line[0:comment_offset]

    # Remove whitespace on the right of the line
    line = line.rstrip(Whitespace)

    # Add an error if there is an odd number of whitespace on the left of the line
    indent_offset = len(line) - len(line.lstrip(Whitespace))

    if indent_offset % 2 > 0:
      errors.append(UnreadableIndentationError(line[indent_offset:]))
      continue

    # Go to the next line if this one is empty
    if len(line) == indent_offset:
      continue

    # Initialize a token instance
    offset = indent_offset
    token = Token(
      data=line[offset:],
      depth=(indent_offset // 2),
      key=None,
      kind=TokenKind.Default,
      value=None
    )

    # If the line starts with a '|', then the token is a string and this iteration ends
    if line[offset] == "|":
      offset = get_offset(line, offset)
      token.kind = TokenKind.String
      token.value = line[offset:] + line_break

    # Otherwise, continue
    else:
      # If the line starts with a '-', then the token is a list
      if line[offset] == "-":
        offset = get_offset(line, offset)
        token.kind = TokenKind.List

      colon_offset = line.find(":", offset)

      # If there is a ':', the token is a key or key-value pair, possibly also a list
      if colon_offset >= 0:
        key = line[offset:colon_offset].rstrip(Whitespace)
        value_offset = get_offset(line, colon_offset)
        value = line[value_offset:]

        if len(key) < 1:
          errors.append(MissingKeyError(location=key.area.location()))
          continue

        token.key = key
        token.value = value if value else None

      # If the token is a list, then it is just a value
      elif token.kind == TokenKind.List:
        token.value = line[offset:]

      # Otherwise the line is invalid
      else:
        errors.append(InvalidLineError(token.data))
        continue

    tokens.append(token)

  return tokens, errors, warnings


def get_offset(line, origin):
  return origin + len(line[(origin + 1):]) - len(line[(origin + 1):].lstrip(Whitespace)) + 1

def is_basic_ascii(text):
  return text.isascii() and text.isprintable()


## Static analysis

class StackEntry:
  def __init__(self, *, key = None, area = None, mode = None, token = None, value = None):
    self.key = key
    self.area = area
    self.mode = mode
    self.token = token
    self.value = value

class StackEntryMode(Enum):
  Dict = 0
  List = 1
  String = 2


class DuplicateKeyError(ReaderError):
  def __init__(self, original, duplicate):
    self.original = original
    self.duplicate = duplicate

  def diagnostic(self):
    return DraftDiagnostic("Duplicate key", ranges=(self.original.area + self.duplicate.area).ranges)

class InvalidIndentationError(ReaderError):
  def __init__(self, target):
    self.target = target

  def diagnostic(self):
    return DraftDiagnostic("Invalid indentation", ranges=self.target.area.ranges)

class InvalidTokenError(ReaderError):
  def __init__(self, target):
    self.target = target

  def diagnostic(self):
    return DraftDiagnostic("Invalid token", ranges=self.target.area.ranges)


def analyze(tokens):
  errors = list()
  warnings = list()

  stack = [StackEntry()]

  def descend(new_depth):
    while len(stack) - 1 > new_depth:
      entry = stack.pop()
      entry_value = add_location(entry)
      head = stack[-1]

      if head.mode == StackEntryMode.Dict:
        head.value[entry.key] = entry_value
      elif head.mode == StackEntryMode.List:
        head.value.append(entry_value)

      if entry.area:
        head.area += entry.area

  for token in tokens:
    depth = len(stack) - 1

    if token.depth > depth:
      errors.append(InvalidIndentationError(token.data))
      continue
    if token.depth < depth:
      descend(token.depth)

    head = stack[-1]

    if not head.mode:
      head.area = LocationArea()

      if token.kind == TokenKind.List:
        head.mode = StackEntryMode.List
        head.value = list()
      elif token.kind == TokenKind.String:
        head.mode = StackEntryMode.String
        head.value = str()
      else:
        head.mode = StackEntryMode.Dict
        head.value = dict()

    if head.mode == StackEntryMode.Dict:
      if token.kind != TokenKind.Default:
        errors.append(InvalidTokenError(token.data))
        continue

      if token.key in head.value:
        errors.append(DuplicateKeyError(next(key for key in head.value if key == token.key), token.key))
        continue

      if token.value is not None:
        head.value[token.key] = token.value
      else:
        stack.append(StackEntry(key=token.key, token=token))

      head.area += token.key.area

    elif head.mode == StackEntryMode.List:
      if token.kind != TokenKind.List:
        errors.append(InvalidTokenError(token.data))
        continue

      if token.key:
        if token.value is not None:
          stack.append(StackEntry(
            area=(token.key.area + token.value.area),
            mode=StackEntryMode.Dict,
            value={ token.key: token.value }
          ))
        else:
          stack.append(StackEntry(
            area=token.key.area,
            mode=StackEntryMode.Dict,
            value=dict()
          ))

          stack.append(StackEntry(key=token.key, token=token))
      else:
        head.value.append(token.value)

      head.area += token.data.area

    elif head.mode == StackEntryMode.String:
      if token.kind != TokenKind.String:
        errors.append(InvalidTokenError(token.data))
        continue

      head.area += token.value.area
      head.value += token.value

  descend(0)

  return add_location(stack[0]), errors, warnings


def add_location(entry):
  if entry.area:
    if entry.mode == StackEntryMode.Dict:
      return LocatedDict(entry.value, entry.area)
    elif entry.mode == StackEntryMode.List:
      return LocatedList(entry.value, entry.area)
    elif entry.mode == StackEntryMode.String:
      return LocatedString(entry.value, entry.area).rstrip("\n")
  elif entry.token:
    return LocatedValueContainer(entry.value, entry.token.data.area)

  return entry.value


## Exported functions

# cont=True -> forced continue as for list items
def dumps(obj, depth = 0, cont = False):
  if isinstance(obj, dict):
    output = "\n" if (not cont) and (depth > 0) else str()

    for index, (key, value) in enumerate(obj.items()):
      value_dumped = dumps(value, depth + 1, False)
      value_space = " " if value_dumped[0] != "\n" else str()
      output += f"{str() if cont and (index < 1) else '  ' * depth}{key}:{value_space}{value_dumped}"

    return output

  if isinstance(obj, list):
    output = "\n" if (not cont) and (depth > 0) else str()

    for item in obj:
      output += f"{'  ' * depth}- {dumps(item, depth + 1, True)}"

    return output

  if isinstance(obj, bool):
    return ("true" if obj else "false") + "\n"

  if isinstance(obj, float) or isinstance(obj, int):
    return str(obj) + "\n"

  if isinstance(obj, str):
    if ("\n" in obj):
      if not cont:
        return ("\n" if depth > 0 else str()) + "\n".join(f"{'  ' * depth}| {line}" for line in obj.splitlines()) + "\n"
    else:
      return obj + "\n"

  if (obj is None) and (not cont):
    return "\n"

  raise Exception("Invalid input")


def parse(raw_source):
  tokens, errors, _ = tokenize(raw_source)

  if errors:
    raise errors[0]

  result, errors, _ = analyze(tokens)

  if errors:
    raise errors[0]

  return result


def loads(raw_source):
  tokens, tokenization_errors, tokenization_warnings = tokenize(raw_source)
  result, analysis_errors, analysis_warnings = analyze(tokens)

  return result, tokenization_errors + analysis_errors, tokenization_warnings + analysis_warnings


## Tests

if __name__ == "__main__":
  # | yy😀🤶🏻
  #   - bar: é34

  tokens, errors, warnings = tokenize(f"""fooo:
  | foo   \n
  | aa
  | y
foox:
  bar: 34
  norf:
    - x
    - y
    - z
  xx: 35
fooy:
  - x
  - y: 34
  - z:
      a: b
      c: d
  - e
x:
s:
foo:
baz:
y:
  | a""")

  from pprint import pprint


  if errors: pprint(errors)
  if warnings: pprint(warnings)

  value, errors, warnings = analyze(tokens)

  if errors: pprint(errors)
  if warnings: pprint(warnings)

  # print(value.area.ranges)
  print(repr(value['foo']))
  print(value['foo'].area)
  print(value['foo'].area.format())


  # key = next(k for k in value.keys() if k == 'foo')
  key = value.get_key('x')
  print(key.area.format())

  # print(value['foo'])
  # print(value['foo'].area)
  # print(type(value['foo']))
  # print(type(value['bar']))

  # value = ([
  #   "foo",
  #   { "baz": "34", "a": "b" },
  #   "plouf",
  #   { "baz": "34", "a": { "x": ["a", "b"], "p": None, "y": "5" } }
  # ])

  # print(">>", repr(value))
  # print("\n".join(f"`{line}`" for line in dumps(value).split("\n")))

  # print(errors[1].original.area)
  # print(errors[1].duplicate.area)

  # print(errors[0].target.area)
  # print(format_source(errors[0].target.area))
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

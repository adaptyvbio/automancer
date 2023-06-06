from dataclasses import dataclass, field
from enum import Enum
import ast
import functools
import math
import re
import sys
from typing import Any, Generic, Optional, TypeVar, cast

from .util.misc import BaseDataInstance, create_datainstance
from .error import Diagnostic, DiagnosticDocumentReference
from .util.decorators import deprecated


@dataclass
class Position:
  line: int
  column: int


class Location:
  def __init__(self, source: 'Source', offset: int):
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
  def __init__(self, source: 'Source', start: int, end: int):
    self.end = end
    self.source = source
    self.start = start

  def __mod__(self, offset: tuple[int, int] | int):
    start, end = offset if isinstance(offset, tuple) else (offset, offset + 1)

    return LocationRange(
      source=self.source,
      start=(self.start + start),
      end=(self.start + end)
    )

  @deprecated
  def __add__(self, other: 'LocationRange'):
    return LocationRange(
      source=self.source,
      start=min(self.start, other.start),
      end=max(self.end, other.end)
    )

  def __lt__(self, other: 'LocationRange'):
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

  @classmethod
  def full_string(cls, source: 'Source', value: str):
    return cls(source, 0, len(value))


class LocationArea:
  def __init__(self, ranges: Optional[list[LocationRange]] = None):
    self.ranges = ranges or list()

  @property
  def source(self):
    return self.ranges[0].source if self.ranges else None

  def enclosing_range(self):
    return LocationRange(
      source=self.ranges[0].source,
      start=self.ranges[0].start,
      end=self.ranges[-1].end
    )

  def single_range(self):
    assert len(self.ranges) == 1
    return self.ranges[0]

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

  def __add__(self, other: 'LocationArea'):
    ranges = (self.ranges + [other]) if isinstance(other, LocationRange) else (self.ranges + other.ranges)
    output = list()

    for range in sorted(ranges):
      if output and (output[-1].end >= range.start):
        output[-1].end = max(output[-1].end, range.end)
      else:
        output.append(LocationRange(range.source, range.start, range.end))

    # print(self, '+', other, '->', output)
    return LocationArea(output)

  def __mod__(self, offset: tuple[int, int] | int):
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

      if not ((end < range_start) or (start > range_end)):
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


T = TypeVar('T')
T_co = TypeVar('T_co', covariant=True)

class LocatedValue(Generic[T_co]):
  __match_args__ = ('value', 'area')

  def __init__(self, value: T_co, area: LocationArea, *, full_area: Optional[LocationArea] = None):
    self.area = area
    self.full_area = full_area or area
    self.value = value

  # # @deprecated
  # def error(self, message):
  #   return LocatedError(message, self.area.ranges[0])

  @property
  def source(self):
    return self.area.source

  @classmethod
  def new(cls, obj: T, area: Optional[LocationArea], *, deep: bool = False) -> 'PossiblyLocatedValue[T]':
    if not area:
      return UnlocatedValue(obj)

    match obj:
      case LocatedValue():
        return obj
      case dict() if deep:
        return LocatedDict({ cls.new(key, area, deep=True): cls.new(value, area, deep=True) for key, value in obj.items() }, area)
      case dict():
        return LocatedDict(obj, area)
      case list() if deep:
        return LocatedList([cls.new(value, area, deep=True) for value in obj], area)
      case list():
        return LocatedList(obj, area)
      case str():
        return LocatedString(obj, area, absolute=False)
      case _:
        return LocatedValueContainer(obj, area)

  def dislocate(self) -> Any:
    match self.value:
      case BaseDataInstance():
        return create_datainstance({
          key: value.dislocate() for key, value in self.value._asdict().items()
        })
      case dict():
        return { key.dislocate(): value.dislocate() for key, value in self.value.items() }
      case list():
        return [item.dislocate() for item in self.value]
      case set():
        return {item.dislocate() for item in self.value}
      case _:
        return self.value

  def __repr__(self):
    return f"{self.__class__.__name__}({self.value!r})"



class UnlocatedValue(Generic[T]):
  def __init__(self, value: T, /):
    self.area = None
    self.value = value

  def dislocate(self):
    return self.value

  def __hash__(self):
    return hash(self.value)

  def __eq__(self, other, /):
    return self.value == other

  def __repr__(self):
    return f"{self.__class__.__name__}({self.value!r})"


PossiblyLocatedValue = LocatedValue[T] | UnlocatedValue[T]


class LocatedValueContainer(LocatedValue[T], Generic[T]):
  def __repr__(self):
    return f"{self.__class__.__name__}({self.value!r})"


class LocatedString(str, LocatedValue[str]):
  def __new__(cls, value: str, *args, **kwargs):
    return super(LocatedString, cls).__new__(cls, value)

  def __init__(self, value: str, area: LocationArea, *, absolute: bool = True):
    LocatedValue.__init__(self, value, area)
    self.absolute = absolute

  def __add__(self, other: 'LocatedString | str'):
    other_located = isinstance(other, LocatedString)

    return LocatedString(
      self.value + str(other),
      self.area + other.area if other_located else self.area,
      absolute=(self.absolute and ((other_located and other.absolute) or (not other)))
    )

  def __radd__(self, other: 'LocatedString'):
    return self + other

  def __getitem__(self, key: int | slice) -> 'LocatedString':
    if isinstance(key, slice):
      if self.absolute:
        start, stop, step = key.indices(len(self))
        return LocatedString(self.value[key], self.area % (start, stop))
      else:
        return LocatedString(self.value[key], self.area, absolute=False)
    else:
      return self[key:(key + 1)] if key >= 0 else self[key:((key - 1) if key < -1 else None)]

  def __repr__(self):
    return f"{self.__class__.__name__}({self.value!r})"

  def split(self, sep: Optional[str], maxsplit: int = -1):
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

  def splitlines(self, keepends: bool = False):
    indices = [index for index, char in enumerate(self.value) if char == "\n"]
    return [self[((a + 1) if a is not None else a):((b + 1) if keepends and (b is not None) else b)] for a, b in zip([None, *indices], [*indices, None])]

  def strip(self, chars: Optional[str] = None):
    return self.lstrip(chars).rstrip(chars)

  def lstrip(self, chars: Optional[str] = None):
    stripped = self.value.lstrip(chars)
    return self[(len(self) - len(stripped)):]

  def rstrip(self, chars: Optional[str] = None):
    stripped = self.value.rstrip(chars)
    return self[0:len(stripped)]

  @functools.cached_property
  def _line_cumlengths(self):
    lengths = [0]

    for line in self.splitlines(keepends=True):
      lengths.append(lengths[-1] + len(line))

    return lengths

  def compute_location(self, position: Position):
    return self._line_cumlengths[position.line] + position.column

  def compute_ast_node_area(self, node: ast.expr | ast.stmt):
    assert self.absolute
    assert node.end_lineno is not None
    assert node.end_col_offset is not None

    start = self.compute_location(Position(node.lineno - 1, node.col_offset))
    end = self.compute_location(Position(node.end_lineno - 1, node.end_col_offset))

    return self.area % (start, end)

  def index_ast_node(self, node: ast.expr):
    return LocatedString(self.value, area=self.compute_ast_node_area(node), absolute=False)

  def index_syntax_error(self, err: SyntaxError):
    assert err.lineno is not None
    assert err.offset is not None
    assert err.end_lineno is not None
    assert err.end_offset is not None

    start = self.compute_location(Position(err.lineno - 1, err.offset - 1))
    end = self.compute_location(Position(err.end_lineno - 1, err.end_offset - 1))

    return self[start:end]

  def offset_position(self, offset: int):
    line = self.value[:offset].count("\n")
    column = (offset - self.value[:offset].rindex("\n") - 1) if line > 0 else offset

    return Position(line, column)

  @staticmethod
  def from_match_group(match: re.Match, group: int):
    span = match.span(group)
    return match.string[span[0]:span[1]]


K = TypeVar('K')
V = TypeVar('V')

class LocatedDict(dict[K, V], LocatedValue[dict[K, V]], Generic[K, V]):
  def __new__(cls, *args, **kwargs):
    return super(LocatedDict, cls).__new__(cls)

  def __init__(self, value: dict[K, V], area: LocationArea):
    LocatedValue.__init__(self, value, area)
    self.update(value)

  def __repr__(self):
    return f"{self.__class__.__name__}({self.value!r})"

  def get_key(self, target: V):
    return next(key for key in self.keys() if key == target)


class LocatedList(list[T], LocatedValue[list[T]], Generic[T]):
  def __new__(cls, *args, **kwargs):
    return super(LocatedList, cls).__new__(cls)

  def __init__(self, value: list, area: LocationArea):
    LocatedValue.__init__(self, value, area)
    self += value

  def __repr__(self):
    return f"{self.__class__.__name__}({self.value!r})"


class Source(LocatedString):
  def __init__(self, value: LocatedString | str, *, origin: Optional[Any] = None):
    if isinstance(value, LocatedString):
      super().__init__(value.value, value.area)
    else:
      super().__init__(value, LocationArea([LocationRange.full_string(self, value)]))

    self.origin = origin


ObjectComments = list[LocatedString]

class ReliableLocatedDict(LocatedDict[K, V], Generic[K, V]):
  def __init__(self, value: dict, /, area: LocationArea, *, comments: dict[LocatedValue, ObjectComments], completion_ranges: Optional[set[LocationRange]] = None, fold_range: LocationRange, full_area: LocationArea):
    super().__init__(value, area)

    self.comments = comments
    self.completion_ranges = completion_ranges or set()
    self.fold_range = fold_range
    self.full_area = full_area

  def transform(self, new_value: dict, /):
    return self.__class__(
      new_value,
      self.area,
      comments=self.comments,
      completion_ranges=self.completion_ranges,
      fold_range=self.fold_range,
      full_area=self.full_area
    )

class ReliableLocatedList(LocatedList):
  def __init__(self, value: list, /, area: LocationArea, *, comments: list[ObjectComments], completion_ranges: Optional[set[LocationRange]] = None, fold_range: LocationRange, full_area: LocationArea):
    super().__init__(value, area)

    self.comments = comments
    self.completion_ranges = completion_ranges or set()
    self.fold_range = fold_range
    self.full_area = full_area

  def transform(self, new_value: list, /):
    return self.__class__(
      new_value,
      self.area,
      comments=self.comments,
      completion_ranges=self.completion_ranges,
      fold_range=self.fold_range,
      full_area=self.full_area
    )


## Tokenization

# Valid
# a: b      key: 'a',   value: 'b',   kind: Default
# a:        key: 'a',   value: None,  kind: Default
# - a:      key: 'a',   value: None,  kind: List
# - a: b    key: 'a',   value: 'b',   kind: List
# - b       key: None,  value: 'b',   kind: List
# | a       key: None,  value: 'a',   kind: String
#
# Invalid
#           key: None,  value: None,  kind: Default,  raw_value: '    '
# a         key: None,  value: 'a',   kind: Default
# :         key: None,  value: None,  kind: Default
# : b       key: None,  value: 'b',   kind: Default
# -         key: None,  value: None,  kind: List,     raw_value: ' '


## Completion cases

# a: b
#  ^
#
# <whitespace>
# ^
#
# : b
# ^
#
# -
#   ^
#
# a
#  ^


IndentationWidth = 2
Whitespace = " "

class TokenKind(Enum):
  Default = 0
  List = 1
  String = 2

@dataclass
class Token:
  comment: Optional[LocatedString]
  data: LocatedString # All data except for indentation, comment, and trailing whitespace
  depth: int
  key: Optional[LocatedString]
  kind: TokenKind
  raw_value: Optional[LocatedString]
  value: Optional[LocatedString]


class ReaderError(Diagnostic):
  pass

class UnreadableIndentationError(ReaderError):
  def __init__(self, target: LocatedValue, /):
    super().__init__(
      "Unreadable indentation",
      references=[DiagnosticDocumentReference.from_value(target)]
    )

class MissingKeyError(ReaderError):
  def __init__(self, target: LocatedValue, /):
    super().__init__(
      "Missing key",
      references=[DiagnosticDocumentReference.from_value(target)]
    )

class InvalidLineError(ReaderError):
  def __init__(self, target: LocatedValue, /):
    super().__init__(
      "Invalid line",
      references=[DiagnosticDocumentReference.from_value(target)]
    )

class InvalidCharacterError(ReaderError):
  def __init__(self, target: LocatedValue, /):
    super().__init__(
      "Invalid character",
      references=[DiagnosticDocumentReference.from_value(target)]
    )


def tokenize(raw_source: Source | str, /):
  errors = list[ReaderError]()
  warnings = list[ReaderError]()

  source = Source(raw_source) if not isinstance(raw_source, Source) else raw_source
  tokens = list[Token]()


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


  # Iterate over all lines and identify their line break
  for full_line in source.splitlines(keepends=True):
    if full_line[-1] == "\n":
      line = full_line[:-1]
      line_break = full_line[-1]
    else:
      line = full_line
      line_break = str()

    # Find and remove the comment on the line, if any
    comment_offset = line.find("#")

    if comment_offset >= 0:
      comment = line[(comment_offset + 1):].strip() or None
      line = line[0:comment_offset]
    else:
      comment = None

    # Calculate the indentation
    indent_offset = len(line) - len(line.lstrip(Whitespace))

    # Remove whitespace on the right end of the line
    unstripped_line = line
    line = line.rstrip(Whitespace)

    # If the line only contained whitespace, that whitespace has already been removed above.
    if indent_offset % IndentationWidth > 0:
      # Raise an error if there is an odd whitespace count on the left end of the line and it is not empty
      if line:
        errors.append(UnreadableIndentationError(line[indent_offset:]))
        continue
      else:
        # Otherwise suppress the comment if the line is empty
        comment = None

    # Initialize a token instance
    offset = indent_offset
    token = Token(
      comment=comment,
      data=line[offset:],
      depth=(indent_offset // IndentationWidth),
      key=None,
      kind=TokenKind.Default,
      raw_value=None,
      value=None
    )

    # Skip this line if empty or full of whitespace
    if not line:
      token.raw_value = unstripped_line

    # If the line starts with a '|', then the token is a string and this iteration ends
    elif line[offset] == "|":
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

        if key:
          token.key = key
        else:
          errors.append(MissingKeyError(key))
          token.key = None

        token.value = value if value else None

      # If the token is a list, then it is just a value
      elif token.kind == TokenKind.List:
        value = line[offset:]

        if value:
          token.value = value
        else:
          errors.append(InvalidLineError(token.data))
          token.raw_value = unstripped_line[offset:]
          token.value = None

      # Otherwise the line is invalid
      else:
        errors.append(InvalidLineError(token.data))
        token.value = line[offset:]

    tokens.append(token)

  return tokens, errors, warnings


# Removes the index of the first non-whitespace character in 'line' starting from 'origin'
def get_offset(line: str, origin: int):
  return origin + len(line[(origin + 1):]) - len(line[(origin + 1):].lstrip(Whitespace)) + 1

def is_basic_ascii(text: str):
  return text.isascii() and text.isprintable()


## Static analysis

class StackEntryMode(Enum):
  Dict = 0
  List = 1
  String = 2

@dataclass(kw_only=True)
class StackEntry:
  comments: list[ObjectComments] = field(default_factory=list)
  key: Optional[LocatedString] = None
  area: Optional[LocationArea] = None
  mode: Optional[StackEntryMode] = None
  parent_key: Optional[LocatedString] = None
  token: Optional[Token] = None
  value: Optional[dict | list | str] = None

  dict_ranges: set[LocationRange] = field(default_factory=set, init=False)
  list_ranges: set[LocationRange] = field(default_factory=set, init=False)


class DuplicateKeyError(ReaderError):
  def __init__(self, original: LocatedString, duplicate: LocatedString, /):
    super().__init__(
      "Invalid value, expected expression",
      references=[
        DiagnosticDocumentReference.from_value(original, id='origin'),
        DiagnosticDocumentReference.from_value(duplicate, id='duplicate')
      ]
    )

class InvalidIndentationError(ReaderError):
  def __init__(self, target: LocatedValue, /):
    super().__init__(
      "Invalid indentation",
      references=[DiagnosticDocumentReference.from_value(target)]
    )

class InvalidTokenError(ReaderError):
  def __init__(self, target: LocatedValue, /):
    super().__init__(
      "Invalid token",
      references=[DiagnosticDocumentReference.from_value(target)]
    )


def analyze(tokens: list[Token]):
  errors = list[ReaderError]()
  warnings = list[ReaderError]()

  comments = list[tuple[LocatedString, int]]()
  stack = [StackEntry()]
  whitespace_tokens = list[Token]()

  # Pops the stack until reaching 'new_depth'
  def descend(new_depth: int):
    depth = len(stack) - 1
    check_diff(depth, new_depth)

    while len(stack) - 1 > new_depth:
      entry = stack.pop()
      head = stack[-1]

      if entry.mode is None:
        assert entry.key
        entry.area = entry.key.area

      entry_value = add_location(entry)

      # Record child values when returning to their parent
      match head.mode:
        case StackEntryMode.Dict:
          assert isinstance(head.value, dict)
          head.value[entry.key] = entry_value
        case StackEntryMode.List:
          assert isinstance(head.value, list)
          head.value.append(entry_value)

  # Adds relevant completion ranges between 'new_depth' and 'old_depth' on tokens recorded in 'whitespace_tokens'
  def check_diff(old_depth: int, new_depth: int):
    # print("!", old_depth, "<->", new_depth)

    for depth in range(min(old_depth, new_depth), max(old_depth, new_depth) + 1):
      entry = stack[depth]

      for whitespace_token in whitespace_tokens:
        assert whitespace_token.raw_value is not None

        if whitespace_token.depth >= depth:
          offset = depth * IndentationWidth
          entry.dict_ranges.add(whitespace_token.raw_value[offset:offset].area.single_range())

    whitespace_tokens.clear()


  for token in tokens:
    depth = len(stack) - 1
    head = stack[-1]

    # If the token is an empty line, we can only process the completion range
    # when we reach the next valid and meaningful token.
    if (token.kind == TokenKind.Default) and (not token.key) and (not token.value) and (token.raw_value is not None):
      if token.comment:
        comments.append((token.comment, token.depth))

      whitespace_tokens.append(token)
      continue

    if token.depth > depth:
      errors.append(InvalidIndentationError(token.data))
      comments.clear()
      continue

    # Descend to the correct depth
    descend(token.depth)
    head = stack[-1]

    # Calculate relevant comments for this token
    relevant_comments = ObjectComments()

    for comment, comment_depth in comments[::-1]:
      if comment_depth != token.depth:
        break

      relevant_comments.append(comment)

    relevant_comments = relevant_comments[::-1] + ([token.comment] if token.comment else ObjectComments())
    comments.clear()

    if (token.kind == TokenKind.Default) and (not token.key):
      # If the token is a single string, we add it as a completion range.
      if token.value:
        head.dict_ranges.add(token.value.area.single_range())

      continue

    # Look at the first token's kind if we do not yet know the entry's type
    if not head.mode:
      head.area = LocationArea()

      match token.kind:
        case TokenKind.Default:
          head.mode = StackEntryMode.Dict
          head.value = dict()
        case TokenKind.List:
          head.mode = StackEntryMode.List
          head.value = list()
        case TokenKind.String:
          head.mode = StackEntryMode.String
          head.value = str()

    if head.mode == StackEntryMode.Dict:
      assert isinstance(head.value, dict)

      # Add an error if the token's kind is unexpected
      if token.kind != TokenKind.Default:
        errors.append(InvalidTokenError(token.data))
        continue

      # Add an error if the token's key already exists
      if token.key in head.value:
        assert token.key
        errors.append(DuplicateKeyError(next(key for key in head.value if key == token.key), token.key))
        continue

      head.comments.append(relevant_comments)

      # a: b
      if token.value:
        head.value[token.key] = token.value

      # a:
      else:
        entry = StackEntry(
          key=token.key,
          parent_key=token.key,
          token=token
        )

        stack.append(entry)

        # Handle completion ranges on the empty lines before this token
        check_diff(len(stack) - 2, len(stack) - 1)

    elif head.mode == StackEntryMode.List:
      assert isinstance(head.value, list)

      if token.kind != TokenKind.List:
        errors.append(InvalidTokenError(token.data))
        continue

      head.comments.append(relevant_comments)

      # - a: ...
      if token.key:
        # - a: b
        if token.value:
          stack.append(StackEntry(
            comments=[ObjectComments()],
            mode=StackEntryMode.Dict,
            value={ token.key: token.value }
          ))

          check_diff(len(stack) - 2, len(stack) - 1)

        # - a:
        #     ...
        else:
          stack.append(StackEntry(
            comments=[ObjectComments()],
            mode=StackEntryMode.Dict,
            value=dict()
          ))

          stack.append(StackEntry(key=token.key, token=token))
          check_diff(len(stack) - 3, len(stack) - 1)

      # - a
      elif token.value:
        head.value.append(token.value)

      # -
      else:
        assert token.raw_value is not None

        for offset in range(len(token.raw_value) + 1):
          head.list_ranges.add(token.raw_value[offset:offset].area.single_range())

    elif head.mode == StackEntryMode.String:
      if token.kind != TokenKind.String:
        errors.append(InvalidTokenError(token.data))
        continue

      assert isinstance(head.value, LocatedString)
      assert isinstance(token.value, LocatedString)
      assert head.area

      head.area += token.value.area
      head.value += token.value

  # Return to the root level
  descend(0)

  return add_location(stack[0]), errors, warnings


# Finalizes created objects
def add_location(entry: StackEntry) -> Any:
  match entry.mode:
    case StackEntryMode.Dict:
      assert isinstance(entry.value, dict)

      area = LocationArea()
      full_area = LocationArea()

      for key, value in entry.value.items():
        full_area += LocationArea([(key.full_area + value.full_area).enclosing_range()])

        if isinstance(value, str):
          assert isinstance(value, LocatedString)
          area += LocationArea([(key.area + value.area).enclosing_range()])
        else:
          area += key.area

      return ReliableLocatedDict(
        entry.value,
        area,
        comments={ key: entry.comments[index] for index, key in enumerate(entry.value.keys()) },
        completion_ranges=entry.dict_ranges,
        fold_range=((full_area + entry.parent_key.area) if entry.parent_key else full_area).enclosing_range(),
        full_area=full_area
      )

    case StackEntryMode.List:
      assert isinstance(entry.value, list)

      area = LocationArea()
      full_area = LocationArea()

      for item in entry.value:
        full_area += item.full_area
        area += item.area

      return ReliableLocatedList(
        entry.value,
        area,
        comments=entry.comments,
        completion_ranges=entry.list_ranges,
        fold_range=((full_area + entry.parent_key.area) if entry.parent_key else full_area).enclosing_range(),
        full_area=full_area
      )

    case StackEntryMode.String:
      assert entry.area
      assert isinstance(entry.value, str)

      return LocatedString(entry.value, entry.area).rstrip("\n")

    case None:
      assert entry.area
      return LocatedValueContainer(None, entry.area)


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


def loads(raw_source: Source | str, /) -> tuple[Any, list[ReaderError], list[ReaderError]]:
  tokens, tokenization_errors, tokenization_warnings = tokenize(raw_source)
  result, analysis_errors, analysis_warnings = analyze(tokens)

  return result, tokenization_errors + analysis_errors, tokenization_warnings + analysis_warnings

def loads2(raw_source: Source | str, /):
  from .analysis import DiagnosticAnalysis

  tokens, tokenization_errors, tokenization_warnings = tokenize(raw_source)
  result, analysis_errors, analysis_warnings = analyze(tokens)

  return DiagnosticAnalysis(
    errors=cast(list[Diagnostic], tokenization_errors + analysis_errors),
    warnings=cast(list[Diagnostic], (tokenization_warnings + analysis_warnings))
  ), result


## Tests

if __name__ == "__main__":
  from pprint import pprint

  # tokens, errors, warnings = tokenize(f"""x:
  # y: 3
  # h:

  # e: 3""")

  source = f"""wash:
  : a
  \x20
"""

  tokens, errors, warnings = tokenize(source)
  source = Source(source)

  pprint(errors)
  pprint(tokens)

  value, errors, warnings = analyze(tokens)

  pprint(errors)

  # for r in value['a'].completion_ranges:
  #   # print(repr(source[r.start]))
  #   print(source[r.start-1:r.start].area.format())


if __name__ == "_main__":
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

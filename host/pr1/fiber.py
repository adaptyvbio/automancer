from . import reader


# def create(name, **kwargs):
#   def create_with_name(**kwargs):
#     return type(name, (), kwargs)

#   return create_with_name(**kwargs) if kwargs else create_with_name

def create(name):
  class A:
    def __init__(self, **kwargs):
      self.__dict__.update(kwargs)

    def __repr__(self):
      props = ", ".join(f"{key}={repr(value)}" for key, value in self.__dict__.items())
      return f"{name}({props})"

  return A

Block = create("Block")
Postfix = create("Postfix")
Segment = create("Segment")


class SequenceParser:
  name = 'sequence'

  def __init__(self, protocol):
    self._protocol = protocol

  def parse_block(self, data_block):
    if 'actions' in data_block:
      entry_indices = None
      last_index = None
      children = list()

      for data_action in data_block['actions']:
        child_block = self._protocol.parse_block(data_action)
        children.append(child_block)

        last_index = child_block.last_index

        if entry_indices is None:
          entry_indices = child_block.entry_indices

      return Block(children=children, entry_indices=entry_indices, last_index=last_index, parser=self)

    return None

  def postfix_block(self, block):
    children = block.children

    for index, child in enumerate(children):
      child.parser.postfix_block(child)

      if index != (len(children) - 1):
        self._protocol._segments[child.last_index].next.append(Postfix(
          kind='goto',
          target=children[index + 1].entry_indices
        ))


class MarkerParser:
  name = 'marker'

  def __init__(self, protocol):
    self._protocol = protocol
    self._markers = dict()

  def parse_block(self, data_block):
    if 'goto' in data_block:
      child_block = self._protocol.parse_block({ key: value for key, value in data_block.items() if key != 'goto' })
      return Block(child=child_block, entry_indices=child_block.entry_indices, goto=data_block['goto'], last_index=child_block.last_index, parser=self)

    if 'marker' in data_block:
      child_block = self._protocol.parse_block({ key: value for key, value in data_block.items() if key != 'marker' })
      self._markers[data_block['marker']] = child_block.entry_indices

      return Block(child=child_block, entry_indices=child_block.entry_indices, goto=None, last_index=child_block.last_index, parser=self)

    return None

  def postfix_block(self, block):
    block.child.parser.postfix_block(block.child)

    if block.goto:
      self._protocol._segments[block.child.last_index].next.append(Postfix(
        kind='goto',
        target=self._markers[block.goto]
      ))


class BranchParser:
  name = 'branch'

  def __init__(self, protocol):
    self._protocol = protocol

  def parse_block(self, data_block):
    if 'parallel' in data_block:
      children = list()

      for data_action in data_block['parallel']:
        child_block = self._protocol.parse_block(data_action)
        children.append(child_block)

      return Block(children=children, entry_indices=[entry_index for child in children for entry_index in child.entry_indices], last_index=children[0].last_index, parser=self)

  def postfix_block(self, block):
    pass


class PumpParser:
  name = 'pump'

  def __init__(self, protocol):
    self._protocol = protocol

  def parse_block(self, data_block):
    if 'pump' in data_block:
      segment = self._protocol.register_segment(self.name, { 'volume': float(data_block['pump']) })
      return Block(entry_indices=[segment.index], last_index=segment.index, parser=self)

    return None

  def postfix_block(self, block):
    pass


Parsers = [MarkerParser, BranchParser, SequenceParser, PumpParser]


class FiberProtocol:
  def __init__(self):
    self._parsers = { Parser.name: Parser(self) for Parser in Parsers }
    self._segments = list()

  def parse(self, text):
    data = reader.parse(text)

    root_block = self.parse_block(data)
    root_block.parser.postfix_block(root_block)

    start_postfix = Postfix(kind='goto', target=root_block.entry_indices)
    print("Start ->", start_postfix)

  def parse_block(self, data_block):
    for parser in self._parsers.values():
      result = parser.parse_block(data_block)

      if result is not None:
        return result

  def register_segment(self, process_name, process_data):
    segment = Segment(
      index=len(self._segments),
      next=list(),
      process_data=process_data,
      process_name=process_name
    )

    self._segments.append(segment)
    return segment


if __name__ == "__main__":
  from pprint import pprint

  p = FiberProtocol()
#   p.parse("""
# name: Fiber
# actions:
#   - pump: 1
#     goto: A
#   - pump: 2
#   - pump: 3
#   - actions:
#       - pump: 5
#         marker: A
#       - pump: 6
#       - actions:
#           - pump: 7
#   - pump: 8
# """)

  p.parse("""
name: Fiber
actions:
  - pump: 2
  - parallel:
      - pump: 1
      - pump: 8
  - pump: 12

""")

  pprint(p._segments)

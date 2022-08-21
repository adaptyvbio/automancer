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

Branch = create("Branch")
Block = create("Block")
BlockStateContext = create("BlockStateContext")
Postfix = create("Postfix")
Segment = create("Segment")


class GotoPostfix(create("GotoPostfix")):
  def __init__(self, target):
    self.target = target

  def execute(self, branch):
    return [Branch(segment_index=target, stack=branch.stack) for target in self.target]

class RepeatPostfix(create("RepeatPostfix")):
  def __init__(self, count, target):
    self.count = count
    self.target = target

  def execute(self, branch):
    if branch.stack[-1]['index'] < self.count:
      return [Branch(segment_index=target, stack=None) for target in self.target]
    else:
      return None


class SequenceParser:
  name = 'sequence'

  def __init__(self, protocol):
    self._protocol = protocol

  def parse_block(self, data_block, state):
    if 'repeat' in data_block:
      count = int(data_block['repeat'])
    else:
      count = 1

    if 'actions' in data_block:
      entry_indices = None
      last_index = None
      children = list()

      block_state = self._protocol.parse_block_state(data_block, state)

      for data_action in data_block['actions']:
        child_block = self._protocol.parse_block(data_action, block_state)
        children.append(child_block)

        last_index = child_block.last_index

        if entry_indices is None:
          entry_indices = child_block.entry_indices

      return Block(children=children, count=count, entry_indices=entry_indices, last_index=last_index, parser=self)

    return None

  def postfix_block(self, block):
    children = block.children

    for index, child in enumerate(children):
      child.parser.postfix_block(child)

      if index != (len(children) - 1):
        self._protocol._segments[child.last_index].next.append(GotoPostfix(
          target=children[index + 1].entry_indices
        ))
      elif block.count > 1:
        self._protocol._segments[child.last_index].next.append(Postfix(
          kind='repeat',
          count=block.count,
          target=block.entry_indices
        ))


class MarkerParser:
  name = 'marker'

  def __init__(self, protocol):
    self._protocol = protocol
    self._markers = dict()

  def parse_block(self, data_block, state):
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
      self._protocol._segments[block.child.last_index].next.append(GotoPostfix(
        target=self._markers[block.goto]
      ))


class BranchParser:
  name = 'branch'

  def __init__(self, protocol):
    self._protocol = protocol

  def parse_block(self, data_block, state):
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

  def parse_block(self, data_block, state):
    if 'pump' in data_block:
      segment_state = self._protocol.parse_block_state(data_block, state, context=BlockStateContext(segment=True))
      segment = self._protocol.register_segment(self.name, { 'volume': float(data_block['pump']) }, segment_state)
      return Block(entry_indices=[segment.index], last_index=segment.index, parser=self)

    return None

  def postfix_block(self, block):
    pass

class FlowParser:
  name = 'flow'

  def __init__(self, protocol):
    self._protocol = protocol

  def parse_block_state(self, data_block, state, context):
    if context.segment and ('flow' in data_block):
      return { 'flow': float(data_block['flow']) }
    else:
      return None


Parsers = [MarkerParser, BranchParser, SequenceParser, PumpParser, FlowParser]


class FiberProtocol:
  def __init__(self):
    self._parsers = { Parser.name: Parser(self) for Parser in Parsers }
    self._segments = list()

  def parse(self, text):
    data = reader.parse(text)

    root_block = self.parse_block(data, state=list())
    root_block.parser.postfix_block(root_block)

    start_postfix = GotoPostfix(target=root_block.entry_indices)
    print("Start ->", start_postfix)

    return


    branches = list()
    segment_next = [start_postfix]

    while True:
      branch = branches[0] if branches else None

      for postfix in segment_next:
        postfix_result = postfix.execute(branch)

        if postfix_result:
          branches = postfix_result
          break
      else:
        break

      segment = self._segments[branches[0].segment_index]
      segment_next = segment.next


  def parse_block(self, data_block, state):
    for parser in self._parsers.values():
      if hasattr(parser, 'parse_block'):
        result = parser.parse_block(data_block, state)

        if result is not None:
          return result

    raise Exception("No process candidate")

  def parse_block_state(self, data_block, state, context = BlockStateContext(segment=False)):
    state = dict()

    for parser in self._parsers.values():
      if hasattr(parser, 'parse_block_state'):
        result = parser.parse_block_state(data_block, state, context)

        if result:
          state.update(result)

    return state

  def register_segment(self, process_name, process_data, segment_state):
    segment = Segment(
      index=len(self._segments),
      next=list(),
      process_data=process_data,
      process_name=process_name,
      state=segment_state
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
    flow: 3
  - actions:
      - pump: 5
        flow: 4
  # - parallel:
  #     - pump: 1
  #     - pump: 8
  # - pump: 12
  # - actions:
  #     - pump: 10
  #     - pump: 11
  #   repeat: 5
  # - pump: 12
""")

  pprint(p._segments)

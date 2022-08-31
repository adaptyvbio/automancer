import collections
import regex

from . import reader


def create(name):
  class A:
    def __init__(self, **kwargs):
      self.__dict__.update(kwargs)

    def __repr__(self):
      props = ", ".join(f"{key}={repr(value)}" for key, value in self.__dict__.items())
      return f"{name}({props})"

  return A


class SpecialDeque:
  def __init__(self):
    self._deque = collections.deque()
    self._start_index = 0

  def append(self, item):
    self._deque.append(item)

  def prepend(self, item):
    self._deque.appendleft(item)
    # self._start_index += 1

  def __getitem__(self, index):
    if isinstance(index, slice):
      return list(self._deque)[index]
    else:
      return self._deque[index + self._start_index]

  def __repr__(self):
    return repr(self._deque)

  @property
  def head(self):
    return len(self._deque) - self._start_index


Branch = create("Branch")
Block = create("Block")
BlockStateContext = create("BlockStateContext")
Postfix = create("Postfix")
Segment = create("Segment")

expr_regex = regex.compile(r"^\$?{{.*?(?<!\\)}}$")


class GotoPostfix(create("GotoPostfix")):
  def __init__(self, target):
    self.target = target

  def execute(self, branch):
    return [Branch(segment_index=target, stack=branch.stack) for target in self.target]


class FunctionsParser:
  name = 'functions'

  def __init__(self, protocol):
    self._functions = dict()
    self._protocol = protocol

  def load(self, data_protocol):
    if 'functions' in data_protocol:
      for name, data_block in data_protocol['functions'].items():
        function_block = self._protocol.parse_block(data_block, state=list())
        function_block.parser.postfix_block(function_block)

        first_segment = self._protocol._segments[function_block.entry_indices[0]]
        last_segment = self._protocol._segments[function_block.last_index]

        last_segment.postfix_nodes.append(Postfix(
          kind='post_call'
        ))

        self._functions[name] = function_block

  def parse_block(self, data_block, state):
    if 'call' in data_block:
      name = data_block['call']

      if name in self._functions:
        segment = self._protocol.register_segment(self.name, dict(), list())
        return Block(call_target=name, entry_indices=[segment.index], last_index=segment.index, parser=self)
      else:
        raise Exception(f"Invalid function '{name}'")

  def postfix_block(self, block):
    function = self._functions[block.call_target]

    # Those should be the same
    first_segment = self._protocol._segments[block.entry_indices[0]]
    last_segment = self._protocol._segments[block.last_index]

    first_segment.prefix_nodes.append(Postfix(
      kind='call',
      target=function.entry_indices[0],
      return_target=(last_segment.index, last_segment.postfix_nodes.head)
    ))


class ConditionParser:
  name = 'condition'

  def __init__(self, protocol):
    self._protocol = protocol

  def parse_block(self, data_block, state):
    if 'if' in data_block:
      child_block = self._protocol.parse_block({ key: value for key, value in data_block.items() if key != 'if' }, state)

      return Block(
        child=child_block,
        condition=data_block['if'],
        entry_indices=child_block.entry_indices,
        last_index=child_block.last_index,
        parser=self
      )

    return None

  def postfix_block(self, block):
    block.child.parser.postfix_block(block.child)

    first_segment = self._protocol._segments[block.entry_indices[0]]
    last_segment = self._protocol._segments[block.last_index]

    first_segment.prefix_nodes.append(Postfix(
      kind='condition',
      condition=block.condition,
      target=(block.last_index, last_segment.postfix_nodes.head)
    ))


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

    for child in children:
      child.parser.postfix_block(child)

    first_segment = self._protocol._segments[children[0].entry_indices[0]]

    if block.count > 1:
      repeat_prefix_index = first_segment.prefix_nodes.head + 1

      first_segment.prefix_nodes.append(Postfix(
        kind='repeat_start'
      ))

      first_segment.prefix_nodes.append(Postfix(
        kind='repeat_init'
      ))

    for index, child in enumerate(children):
      child_last_segment = self._protocol._segments[child.last_index]

      if index != (len(children) - 1):
        child_last_segment.postfix_nodes.append(Postfix(
          kind='sequence',
          target=children[index + 1].entry_indices
        ))
      elif block.count > 1:
        child_last_segment.postfix_nodes.append(Postfix(
          kind='repeat_end',
          count=block.count,
          target=(block.entry_indices[0], repeat_prefix_index)
        ))


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



Parsers = [ConditionParser, SequenceParser, PumpParser, FunctionsParser]


class FiberProtocol:
  def __init__(self):
    self._parsers = { Parser.name: Parser(self) for Parser in Parsers }
    self._segments = list()

  def parse(self, text):
    data = reader.parse(text)

    for parser in self._parsers.values():
      if hasattr(parser, 'load'):
        parser.load(data)

    root_block = self.parse_block(data, state=list())
    root_block.parser.postfix_block(root_block)

    # start_postfix = GotoPostfix(target=root_block.entry_indices)
    start_postfix = Postfix(kind='start', target=root_block.entry_indices[0])
    print("Start ->", start_postfix)


    # return

    # branches = list()
    current_phase = 'prefix'
    current_segment_index = start_postfix.target
    current_affix_index = None
    current_stack = list()

    while True:
      # print(f"{current_phase.upper()} -> {current_segment_index} {current_affix_index}", current_stack)

      segment = self._segments[current_segment_index]

      if current_phase == 'prefix':
        for prefix in segment.prefix_nodes[:current_affix_index][::-1]:
          prefix_result = None

          if prefix.kind == 'repeat_init':
            current_stack.append({ 'index': -1 })
          elif prefix.kind == 'repeat_start':
            current_stack[-1]['index'] += 1
          elif prefix.kind == 'call':
            prefix_result = ('prefix', prefix.target, None)
            current_stack.append({ '_return': prefix.return_target })
          else:
            raise Exception(f"Unknown prefix '{prefix.kind}'")

          if prefix_result:
            current_phase, current_segment_index, current_affix_index = prefix_result
            break
        else:
          # run segment

          print("Run segment", segment.process_data, current_stack)

          current_phase = 'postfix'
          current_affix_index = None

          continue

      if current_phase == 'postfix':
        for postfix in segment.postfix_nodes[current_affix_index:]:
          # postfix_result = postfix.execute()
          postfix_result = None

          if postfix.kind == 'sequence':
            postfix_result = ('prefix', postfix.target[0], 0)
          elif postfix.kind == 'repeat_end':
            if current_stack[-1]['index'] == postfix.count - 1:
              current_stack.pop()
            else:
              postfix_result = ('prefix', *postfix.target)
          elif postfix.kind == 'post_call':
            popped = current_stack.pop()
            postfix_result = ('postfix', *popped['_return'])
          else:
            raise Exception(f"Unknown postfix '{postfix.kind}'")

          if postfix_result:
            current_phase, current_segment_index, current_affix_index = postfix_result
            break
        else:
          break


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
      prefix_nodes=SpecialDeque(),
      postfix_nodes=SpecialDeque(),
      process_data=process_data,
      process_name=process_name,
      state=segment_state
    )

    self._segments.append(segment)
    return segment


if __name__ == "__main__":
  from pprint import pprint

  p = FiberProtocol()
  p.parse("""
name: Fiber

functions:
  foo:
    actions:
      - pump: 0
      - pump: 1
      - pump: 2

actions:
  # - pump: 3
  # - actions:
  #     - pump: 4
  #     - pump: 5
  #   repeat: 2
  # - pump: 6

  - actions:
      - call: foo
      - pump: 12
    repeat: 2

  # - pump: 3
  # - actions:
  #     - pump: 4
  #     - pump: 5
  #   if: something
  # - pump: 6
""")

  pprint(p._segments)

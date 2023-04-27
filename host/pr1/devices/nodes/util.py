import asyncio
from asyncio import Handle
import functools
from typing import Callable, Literal, Optional, Sequence

from .value import ValueNode
from ...util.asyncio import AsyncCancelable, Cancelable, register_all
from .readable import WatchableNode
from .common import BaseNode


WatchMode = Literal['connection', 'ownership', 'value']
WatchModes = set[WatchMode]

async def watch_nodes(listener: Callable[[dict[BaseNode, WatchModes]], None], nodes: Sequence[BaseNode], *, modes: WatchModes):
  callback_handle: Optional[Handle] = None
  changed_nodes = dict[BaseNode, WatchModes]()

  def main_listener(mode: WatchMode, node: WatchableNode):
    nonlocal callback_handle

    if not node in changed_nodes:
      changed_nodes[node] = WatchModes()

    changed_nodes[node].add(mode)

    if (not callback_handle) and ready:
      loop = asyncio.get_event_loop()
      callback_handle = loop.call_soon(callback)

  def callback():
    if ready:
      nonlocal callback_handle
      callback_handle = None

      listener(changed_nodes.copy())
      changed_nodes.clear()

  connection_listener = functools.partial(main_listener, 'connection')
  ownership_listener = functools.partial(main_listener, 'ownership')
  value_listener = functools.partial(main_listener, 'value')

  async_regs = await register_all([node.watch_value(value_listener) for node in nodes if isinstance(node, WatchableNode)]) if 'value' in modes else list[AsyncCancelable]()
  sync_regs = list[Cancelable]()

  if 'connection' in modes:
    sync_regs += [node.watch_connection(connection_listener) for node in nodes]

  if 'ownership' in modes:
    sync_regs += [node.watch_ownership(ownership_listener) for node in nodes if isinstance(node, ValueNode) and node.writable]

  ready = True

  async def cancel():
    nonlocal ready
    ready = False

    if callback_handle:
      callback_handle.cancel()

    for reg in async_regs:
      await reg.cancel()

    for reg in sync_regs:
      reg.cancel()

  return AsyncCancelable(cancel)

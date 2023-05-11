import asyncio
from asyncio import Event, Handle
from collections import deque
import functools
from typing import Literal, Optional, Sequence

from .value import ValueNode
from ...util.asyncio import AsyncCancelable, Cancelable, register_all
from .readable import WatchableNode
from .common import BaseNode, NodeListenerMode


WatchModes = set[NodeListenerMode]
WatchEvent = dict[BaseNode, WatchModes]

class Watcher:
  def __init__(self, nodes: Sequence[BaseNode], *, modes: WatchModes):
    self._modes = modes
    self._nodes = nodes

    self._async_regs: list[AsyncCancelable]
    self._callback_handle: Optional[Handle] = None
    self._event = Event()
    self._queue = deque[WatchEvent]()
    self._ready = False
    self._started = False
    self._sync_regs: list[Cancelable]

  async def __aiter__(self):
    if not self._started:
      await self.start()

    while True:
      yield await self.wait_event()

  async def wait_event(self):
    await self._event.wait()
    event = self._queue.pop()

    if not self._queue:
      self._event.clear()

    return event


  async def start(self):
    if self._started:
      raise Exception("Already started")

    self._started = True

    changed_nodes = dict[BaseNode, WatchModes]()

    def listener(node: WatchableNode, *, mode: NodeListenerMode):
      if not node in changed_nodes:
        changed_nodes[node] = WatchModes()

      changed_nodes[node].add(mode)

      if (not self._callback_handle) and self._ready:
        loop = asyncio.get_event_loop()
        self._callback_handle = loop.call_soon(callback)

    def callback():
      if self._ready:
        self._callback_handle = None

        self._event.set()
        self._queue.append(changed_nodes.copy())

        changed_nodes.clear()

    self._sync_regs = list[Cancelable]()

    if 'value' in self._modes:
      self._sync_regs += await register_all([node.watch_value(listener) for node in self._nodes if isinstance(node, WatchableNode)])

    if 'connection' in self._modes:
      self._sync_regs += [node.watch_connection(listener) for node in self._nodes]

    if 'content' in self._modes:
      self._sync_regs += [node.watch_content(listener) for node in self._nodes if isinstance(node, ValueNode)]

    if 'ownership' in self._modes:
      self._sync_regs += [node.watch_ownership(listener) for node in self._nodes if isinstance(node, ValueNode) and node.writable]

    self._ready = True

  async def stop(self):
    self._ready = False

    if self._callback_handle:
      self._callback_handle.cancel()
      self._callback_handle = None

    for reg in self._sync_regs:
      reg.cancel()

    del self._sync_regs

    self._started = False

  async def __aenter__(self):
    await self.start()
    return self

  async def __aexit__(self, exc_name, exc, exc_type):
    await self.stop()

from asyncio import Task
import asyncio
from typing import Any, AsyncGenerator, Awaitable, Callable, NewType, Protocol

from pr1.util.pool import Pool

from .bridges.protocol import BaseClient


ChannelId = NewType('ChannelId', int)

class Agent:
  def __init__(self, client: BaseClient, *, pool: Pool):
    self.client = client
    self.pool = pool

    self._channels = dict[ChannelId, Channel]()
    self._next_channel_id = 0

  def _create_channel_id(self):
    channel_id = ChannelId(self._next_channel_id)
    self._next_channel_id += 1
    return channel_id

  async def _send(self, message: Any, /, channel_id: ChannelId):
    await self.client.send({
      "type": "channel",
      "id": channel_id,
      "data": message
    })

  async def receive(self, message: Any, /, channel_id: ChannelId):
    await self._channels[channel_id].receive(message)

  def register_generator_channel(self, generator: AsyncGenerator[Any, None], /):
    channel = GeneratorChannel(
      generator,
      agent=self,
      id=self._create_channel_id()
    )

    self._channels[channel.id] = channel
    return channel


class Channel(Protocol):
  def __init__(self, send: Callable[[Any], Awaitable[None]]):
    ...

  async def close(self):
    ...

  async def receive(self, data: Any, /):
    ...


class GeneratorChannel(Channel):
  def __init__(self, generator: AsyncGenerator[Any, None], /, agent: Agent, id: ChannelId):
    self.id = id
    self._task: Task[None]

    async def loop():
      async for message in generator:
        await agent._send(message, channel_id=self.id)

    self._task = asyncio.create_task(loop())
    agent.pool.add(self._task)

  async def close(self):
    self._task.cancel()

  async def receive(self, data: Any, /):
    await self.close()

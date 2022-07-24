import asyncio
import json
import sys

from ..client import BaseClient


class Client(BaseClient):
  remote = False

  def __init__(self, reader, writer):
    super().__init__()

    self.reader = reader
    self.writer = writer

    self.id = "0"

  async def recv(self):
    return json.loads(await self.reader.readline())

  async def send(self, message):
    self.writer.write((json.dumps(message) + "\n").encode("utf-8"))


class StdioBridge:
  def __init__(self, app):
    self.app = app
    self.client = None

  async def initialize(self):
    loop = asyncio.get_event_loop()
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await loop.connect_read_pipe(lambda: protocol, sys.stdin)

    w_transport, w_protocol = await loop.connect_write_pipe(asyncio.streams.FlowControlMixin, sys.stdout)
    writer = asyncio.StreamWriter(w_transport, w_protocol, reader, loop)

    self.client = Client(reader, writer)

  async def start(self, handle_client):
    await handle_client(self.client)

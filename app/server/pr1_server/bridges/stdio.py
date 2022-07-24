import asyncio
import json
import sys


class StdioBridge:
  def __init__(self, app):
    self.app = app

    self.reader = None
    self.writer = None

  async def initialize(self):
    loop = asyncio.get_event_loop()
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await loop.connect_read_pipe(lambda: protocol, sys.stdin)

    w_transport, w_protocol = await loop.connect_write_pipe(asyncio.streams.FlowControlMixin, sys.stdout)
    writer = asyncio.StreamWriter(w_transport, w_protocol, reader, loop)

    self.reader = reader
    self.writer = writer

  async def start(self, receive):
    while True:
      msg = await self.reader.readline()
      message = json.loads(msg)

      await receive(message)

  async def send(self, message, *, ref):
    self.writer.write((json.dumps(message) + "\n").encode("utf-8"))

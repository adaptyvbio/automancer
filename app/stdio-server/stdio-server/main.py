import asyncio
from pathlib import Path
import appdirs
import json
import sys

from pr1 import Host


class Backend:
  def __init__(self, data_dir):
    self.data_dir = data_dir

class App():
  def __init__(self):
    self.data_dir = Path(appdirs.user_data_dir("PR-1", "Hsn"))
    self.data_dir.mkdir(exist_ok=True)

    self.host = Host(backend=Backend(data_dir=self.data_dir), update_callback=self.update)
    self.updating = False

  async def create(self):
    loop = asyncio.get_event_loop()
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await loop.connect_read_pipe(lambda: protocol, sys.stdin)

    w_transport, w_protocol = await loop.connect_write_pipe(asyncio.streams.FlowControlMixin, sys.stdout)
    writer = asyncio.StreamWriter(w_transport, w_protocol, reader, loop)

    self.reader = reader
    self.writer = writer

    # return reader, writer

  async def listen(self):
    while True:
      msg = await self.reader.readline()
      message = json.loads(msg)

      if message["type"] == "request":
        response_data = await self.host.process_request(message["data"])

        self.write({
          "type": "response",
          "id": message["id"],
          "data": response_data
        })

  def start(self):
    loop = asyncio.get_event_loop()

    loop.run_until_complete(self.host.initialize())
    loop.run_until_complete(self.create())
    loop.create_task(self.host.start())
    loop.create_task(self.listen())

    self.update()

    loop.run_forever()

  def update(self):
    if not self.updating:
      self.updating = True

      def send_state():
        self.write({
          "type": "state",
          "data": self.host.get_state()
        })

        self.updating = False

      loop = asyncio.get_event_loop()
      loop.call_soon(send_state)

  def write(self, data):
    self.writer.write((json.dumps(data) + "\n").encode("utf-8"))


app = App()
app.start()

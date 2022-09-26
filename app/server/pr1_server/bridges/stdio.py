import asyncio
import json
import sys
import threading

from ..client import BaseClient


class Client(BaseClient):
  privileged = False
  remote = False

  def __init__(self):
    super().__init__()
    self.id = "0"

  async def recv(self):
    loop = asyncio.get_event_loop()
    fut = loop.create_future()

    def _run():
      line = sys.stdin.readline()
      loop.call_soon_threadsafe(fut.set_result, line)

    threading.Thread(target=_run, daemon=True).start()
    return json.loads(await fut)

  async def send(self, message):
    sys.stdout.write(json.dumps(message) + "\n")
    sys.stdout.flush()


class StdioBridge:
  def __init__(self, app):
    self.app = app
    self.client = None

  async def initialize(self):
    self.client = Client()

  async def start(self, handle_client):
    try:
      await handle_client(self.client)
    except asyncio.CancelledError:
      pass

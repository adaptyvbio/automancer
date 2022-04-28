import asyncio
import json
from pathlib import Path
import uuid
import websockets


__version__ = "0.0.0"


class Application:
  def __init__(self, version):
    self.config_version = version

    self.config = None
    self._config_path = Path.cwd() / "config.json"
    self._clients = set()

    self._host = "127.0.0.1"
    self._port = 4567

    self._load_config()

    if self.config['version'] < self.config_version:
      self._upgrade_config()
    if self.config['version'] > self.config_version:
      raise Exception("Software version too old")


  def save_config(config):
    pass


  # Configuration

  def _load_config(self):
    if self._config_path.exists():
      self.config = json.load(self._config_path.open())
    else:
      self._save_config({
        'id': str(uuid.uuid4()),
        'version': 0
      })

  def _save_config(self, config = None):
    if config:
      self.config = config

    json.dump(self.config, self._config_path.open(mode="w"))

  def _upgrade_config(self):
    new_config = self.upgrade_config()

    if new_config:
      self.config = new_config

    self.config['version'] = self.config_version
    self._save_config()


  # Socket server

  def broadcast(self, message):
    websockets.broadcast(self._clients, message)

  async def serve(self):
    async def handler(client):
      self._clients.add(client)

      try:
        await self.connect(client)
      finally:
        self._clients.remove(client)

    stop = asyncio.Future()

    async with websockets.serve(handler, host=self._host, port=self._port):
      await stop

  def start(self):
    asyncio.run(self.initialize())
    asyncio.run(self.serve())


  # Default implementation

  async def connect(self, client):
    pass

  async def initialize(self):
    pass

  def upgrade_config(self):
    pass

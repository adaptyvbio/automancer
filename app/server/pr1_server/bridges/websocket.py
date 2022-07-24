import asyncio
import json
import logging
import websockets

from .. import logger as parent_logger
from ..auth import agents as auth_agents
from ..client import BaseClient, ClientClosed


logger = parent_logger.getChild("bridges.websocket")


class Client(BaseClient):
  remote = True

  def __init__(self, conn):
    super().__init__()
    self.conn = conn

  @property
  def id(self):
    return str(self.conn.id)

  async def recv(self):
    try:
      return json.loads(await self.conn.recv())
    except websockets.exceptions.ConnectionClosed as e:
      raise ClientClosed() from e

  async def send(self, message):
    try:
      await self.conn.send(json.dumps(message))
    except websockets.exceptions.ConnectionClosed as e:
      raise ClientClosed() from e


class WebsocketBridge:
  def __init__(self, app, *, conf):
    self.app = app
    self.clients = set()
    self.conf = conf
    self.server = None

  async def initialize(self):
    pass

  async def start(self, handle_client):
    async def handler(conn):
      if self.conf.get('single_client'):
        for client in list(self.clients):
          await client.conn.close()

      client = Client(conn)
      self.clients.add(client)

      try:
        await handle_client(client)
      finally:
        self.clients.remove(client)

    hostname = self.conf['hostname']
    port = self.conf['port']

    logger.debug(f"Listening on {hostname}:{port}")

    self.server = await websockets.serve(handler, host=hostname, port=port)

    try:
      await self.server.wait_closed()
    except asyncio.CancelledError:
      self.server.close()
      await self.server.wait_closed()
    finally:
      logger.debug("Done closing bridge")

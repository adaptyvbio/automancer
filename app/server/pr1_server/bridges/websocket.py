import aiohttp.web
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

    # HTTP server

    @aiohttp.web.middleware
    async def middleware(request, handler):
      if self.conf.get('authenticate_http_clients'):
        authorization = request.headers.get('Authorization')

        if (authorization is None) or (not any(client.id == authorization for client in self.clients)):
          return aiohttp.web.Response(status=403, text="Invalid authorization header")

      return await handler(request)

    self.http_app = aiohttp.web.Application(middlewares=[middleware])

    self.http_app.add_routes([
      *[aiohttp.web.static(f"/{name}/{unit.version}", unit.client_path) for name, unit in self.app.host.units.items() if hasattr(unit, 'client_path')]
    ])

    self.http_runner = aiohttp.web.AppRunner(self.http_app)
    self.http_site = None

  async def initialize(self):
    await self.http_runner.setup()

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

    self.http_site = aiohttp.web.TCPSite(self.http_runner, 'localhost', self.conf['port'] + 1)
    self.server = await websockets.serve(handler, host=hostname, port=port)

    try:
      await asyncio.gather(
        self.server.wait_closed(),
        self.http_site.start()
      )
    except asyncio.CancelledError:
      await self.http_runner.cleanup()

      self.server.close()
      await self.server.wait_closed()
    finally:
      logger.debug("Done closing bridge")

from asyncio import Future, Server
import json
import random
import ssl
from collections import namedtuple
from typing import TYPE_CHECKING, Optional

import websockets
import websockets.exceptions

from .. import logger as parent_logger
from ..auth import agents as auth_agents
from ..certificate import use_certificate
from .protocol import BridgeAdvertisementInfo, BridgeProtocol, ClientClosed, BaseClient

if TYPE_CHECKING:
  from ..conf import ConfBridgeWebsocket


logger = parent_logger.getChild("bridges.websocket")


class Client(BaseClient):
  privileged = False

  def __init__(self, conn):
    super().__init__()
    self.conn = conn

  @property
  def id(self):
    return str(self.conn.id)

  @property
  def remote(self):
    return self.conn.remote_address[0] != "::1"

  async def recv(self):
    try:
      return json.loads(await self.conn.recv())
    except websockets.exceptions.ConnectionClosed as e:
      raise ClientClosed from e

  async def send(self, message):
    try:
      await self.conn.send(json.dumps(message, allow_nan=False))
    except websockets.exceptions.ConnectionClosed as e:
      raise ClientClosed from e


class WebsocketBridge(BridgeProtocol):
  def __init__(self, app, *, conf: 'ConfBridgeWebsocket'):
    self._clients = set[Client]()
    self._conf = conf

    if conf.secure:
      self._cert_info = use_certificate(app.certs_dir, logger=logger)

      if not self._cert_info:
        logger.error("Failed to obtain a certificate")
    else:
      self.cert_info = None
      logger.warn("Not using a secure HTTP connection")


  async def start(self, handle_client):
    server: Optional[Server] = None

    async def handler(conn):
      if self._conf.single_client:
        for client in list(self._clients):
          await client.conn.close()

      client = Client(conn)
      self._clients.add(client)

      try:
        await handle_client(client)
      finally:
        self._clients.remove(client)

    try:
      if self.cert_info:
        ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
        ssl_context.load_cert_chain(self.cert_info.cert_path, self.cert_info.key_path)
      else:
        ssl_context = None

      server = await websockets.serve(handler, host=self._conf.hostname, port=self._conf.port, max_size=(5 * (2 ** 20)), ssl=ssl_context) # type: ignore
      logger.debug(f"Listening on {self._conf.hostname}:{self._conf.port}")

      yield
      await Future()
    finally:
      if server:
        server.close()
        await server.wait_closed()

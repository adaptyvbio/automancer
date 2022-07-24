import asyncio
import json
import logging
import websockets

from .. import logger as parent_logger
from ..auth import agents as auth_agents


logger = parent_logger.getChild("bridges.websocket")


class Client:
  def __init__(self, *, authenticated, conn):
    self.authenticated = authenticated
    self.conn = conn
    self.sessions = dict()

  @property
  def id(self):
    return self.conn.id


class WebsocketBridge:
  def __init__(self, app, *, conf):
    self.app = app
    self.clients = dict()
    self.conf = conf
    self.server = None

    self.auth_agents = [
      auth_agents[conf_method['type']](conf_method) for conf_method in conf['authentication']
    ] if 'authentication' in conf else None

  async def handle_client(self, client, receive):
    await client.conn.send(json.dumps({
      "authMethods": [
        agent.export() for agent in self.auth_agents
      ] if self.auth_agents else None,
      "features": self.app.conf['features'],
      "version": self.app.version
    }))

    if self.auth_agents:
      while True:
        message = json.loads(await client.conn.recv())
        agent = self.auth_agents[message["authMethodIndex"]]

        if agent.test(message["data"]):
          await client.conn.send(json.dumps({ "ok": True }))
          break
        else:
          await client.conn.send(json.dumps({ "ok": False, "message": "Invalid credentials" }))

    client.authenticated = True
    logger.info(f"Authenticated client '{client.id}'")

    await receive(None, ref=client.id)

    async for msg in client.conn:
      message = json.loads(msg)
      await receive(message, ref=client.id)

  async def initialize(self):
    pass

  async def start(self, receive):
    async def handler(conn):
      if not self.app.conf['features']['multiple_clients']:
        for client in list(self.clients.values()):
          await client.conn.close()

      client = Client(authenticated=False, conn=conn)
      self.clients[client.id] = client

      logger.debug(f"Added client '{client.id}'")

      try:
        await self.handle_client(client, receive)
      except websockets.exceptions.ConnectionClosedError:
        logger.debug(f"Disconnected client '{client.id}'")
      finally:
        for session in client.sessions.values():
          session.close()

        del self.clients[client.id]
        logger.debug(f"Removed client '{client.id}'")

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

  async def send(self, message, *, ref):
    if ref:
      client = self.clients[ref]
      await client.conn.send(json.dumps(message))
    else:
      websockets.broadcast([client.conn for client in self.clients.values()], message)


  def update_conf(conf):
    updated_conf = False

    if 'authentication' in conf:
      for index, conf_method in enumerate(conf['authentication']):
        Agent = auth_agents[conf_method['type']]

        if hasattr(Agent, 'update_conf'):
          updated_conf_method = Agent.update_conf(conf_method)

          if updated_conf_method:
            conf['authentication'][index] = updated_conf_method
            updated_conf = True

    return updated_conf

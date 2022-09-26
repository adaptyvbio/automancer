from pathlib import Path
import appdirs
import argparse
import asyncio
import json
import logging
import os
import signal
import sys
import uuid

from pr1 import Host, reader
from pr1.util import schema as sc

logger = logging.getLogger("pr1.app")

from .auth import agents as auth_agents
from .bridges.stdio import StdioBridge
from .bridges.websocket import WebsocketBridge
from .client import ClientClosed
from .session import Session
from .trash import trash


class Backend:
  def __init__(self, app):
    self._app = app

  @property
  def data_dir(self):
    return self._app.data_dir

  def notify(self, message):
    self._app.broadcast(json.dumps({
      "type": "app.notification",
      "message": message
    }))

  def reveal(self, path: Path):
    if self._app.owner_bridge:
      asyncio.create_task(self._app.owner_bridge.client.send({
        "type": "owner.reveal",
        "path": str(path)
      }))
    else:
      if sys.platform == "darwin":
        os.system(f"open -R '{str(path)}'")

      # TODO: Add support for Linux and Windows

  def trash(self, path: Path):
    if self._app.owner_bridge:
      asyncio.create_task(self._app.owner_bridge.client.send({
        "type": "owner.trash",
        "path": str(path)
      }))
    else:
      trash(path)


conf_schema = sc.Schema({
  'authentication': sc.Optional(sc.List(
    sc.Or(*[Agent.conf_schema for Agent in auth_agents.values()])
  )),
  'features': {
    'restart': sc.ParseType(bool),
    'terminal': sc.ParseType(bool),
    'write_config': sc.ParseType(bool)
  },
  'identifier': str,
  'remote': sc.Optional({
    'hostname': str,
    'port': sc.ParseType(int),
    'secure': sc.Optional(sc.ParseType(bool)),
    'static_authenticate_clients': sc.Optional(sc.ParseType(bool)),
    'static_port': sc.Optional(sc.ParseType(int)),
    'single_client': sc.Optional(sc.ParseType(bool))
  }),
  'version': sc.ParseType(int)
})

class App:
  version = 2

  def __init__(self, *, data_dir = None, local = False):
    logger.info(f"Running process with id {os.getpid()}")
    logger.info(f"Running Python {sys.version}")


    # Create data directory if missing

    self.data_dir = Path(data_dir or appdirs.user_data_dir("PR-1", "Hsn"))
    self.data_dir.mkdir(exist_ok=True, parents=True)

    logger.debug(f"Storing data in '{self.data_dir}'")


    # Load or create configuration

    conf_path = self.data_dir / "app.yml"

    if conf_path.exists():
      try:
        conf = reader.parse((self.data_dir / "app.yml").open().read())
        conf = conf_schema.transform(conf)
      except reader.LocatedError as e:
        e.display()
        sys.exit(1)

      if conf['version'] != self.version:
        logger.error("Configuration version mismatch")
        sys.exit(1)

      conf_updated = False
    else:
      conf = {
        'identifier': str(uuid.uuid4()),
        'version': self.version,
        'features': {
          'restart': False,
          'terminal': False,
          'write_config': False
        },
        'remote': {
          'hostname': "localhost",
          'port': 4567
        }
      }

      conf_updated = True


    # Create authentication agents

    if 'authentication' in conf:
      for index, conf_method in enumerate(conf['authentication']):
        Agent = auth_agents[conf_method['type']]

        if hasattr(Agent, 'update_conf'):
          conf_updated_method = Agent.update_conf(conf_method)

          if conf_updated_method:
            conf['authentication'][index] = conf_updated_method
            conf_updated = True

    self.auth_agents = [
      auth_agents[conf_method['type']](conf_method) for conf_method in conf['authentication']
    ] if 'authentication' in conf else None


    # Write configuration if it has been updated

    if conf_updated:
      logger.info("Writing app configuration")
      conf_path.open("w").write(reader.dumps(conf) + "\n")


    # Create host

    self.clients = dict()
    self.conf = conf
    self.host = Host(
      backend=Backend(self),
      update_callback=self.update
    )


    # Create bridges

    self.bridges = set()

    if local:
      self.owner_bridge = StdioBridge(self)
      self.bridges.add(self.owner_bridge)
    else:
      self.owner_bridge = None

    if 'remote' in conf:
      self.remote_bridge = WebsocketBridge(self, conf=conf['remote'])
      self.bridges.add(self.remote_bridge)
    else:
      self.remote_bridge = None


    # Misc

    self.updating = False
    self._main_task = None


  async def handle_client(self, client):
    try:
      logger.debug(f"Added client '{client.id}'")

      self.clients[client.id] = client
      requires_auth = self.auth_agents and client.remote

      await client.send({
        "authMethods": [
          agent.export() for agent in self.auth_agents
        ] if requires_auth else None,
        "features": {
          "terminal": self.conf['features']['terminal'] and client.remote
        },
        "identifier": self.conf['identifier'],
        "staticUrl": (self.remote_bridge.static_url if self.remote_bridge else None),
        "version": self.version
      })

      if requires_auth:
        while True:
          message = await client.recv()
          agent = self.auth_agents[message["authMethodIndex"]]

          if agent.test(message["data"]):
            await client.send({ "ok": True })
            break
          else:
            await client.send({ "ok": False, "message": "Invalid credentials" })

      logger.debug(f"Authenticated client '{client.id}'")

      await client.send({
        "type": "state",
        "data": self.host.get_state()
      })

      async for message in client:
        match message['type']:
          case "exit":
            logger.info("Exiting after receiving an exit message")
            self.stop()
          case "request":
            response_data = await self.process_request(client, message["data"])

            await client.send({
              "type": "response",
              "id": message["id"],
              "data": response_data
            })
    except ClientClosed:
      logger.debug(f"Disconnected client '{client.id}'")
    finally:
      for session in client.sessions.values():
        session.close()

      del self.clients[client.id]
    logger.debug(f"Removed client '{client.id}'")

  async def broadcast(self, message):
    for client in list(self.clients.values()):
      try:
        await client.send(message)
      except ClientClosed:
        pass

  async def process_request(self, client, request):
    if request["type"] == "app.session.create":
      id = str(uuid.uuid4())
      session = Session(size=(request["size"]["columns"], request["size"]["rows"]))

      client.sessions[id] = session
      logger.info(f"Created terminal session with id '{id}'")

      async def start_session():
        try:
          async for chunk in session.start():
            await client.send({
              "type": "app.session.data",
              "id": id,
              "data": list(chunk)
            })

          del client.sessions[id]
          logger.info(f"Closed terminal session with id '{id}'")

          await client.send({
            "type": "app.session.close",
            "id": id,
            "status": session.status
          })
        except ClientClosed:
          pass

      loop = asyncio.get_event_loop()
      loop.create_task(start_session())

      return {
        "id": id
      }

    elif request["type"] == "app.session.data":
      client.sessions[request["id"]].write(bytes(request["data"]))

    elif request["type"] == "app.session.close":
      client.sessions[request["id"]].close()

    elif request["type"] == "app.session.resize":
      client.sessions[request["id"]].resize((request["size"]["columns"], request["size"]["rows"]))

    else:
      return await self.host.process_request(request, client=client)

  def update(self):
    if not self.updating:
      self.updating = True

      async def send_state():
        await self.broadcast({
          "type": "state",
          "data": self.host.get_state_update()
        })

        self.updating = False

      loop = asyncio.get_event_loop()
      loop.create_task(send_state())

  def start(self):
    logger.info("Starting app")

    loop = asyncio.get_event_loop()
    loop.run_until_complete(self.host.initialize())

    logger.debug(f"Initializing {len(self.bridges)} bridges")

    for bridge in self.bridges:
      loop.run_until_complete(bridge.initialize())

    tasks = set()

    for bridge in self.bridges:
      async def handle_client(client):
        await self.handle_client(client)

      task = loop.create_task(bridge.start(handle_client))
      tasks.add(task)

    async def start():
      try:
        await asyncio.gather(*tasks)
      except asyncio.CancelledError:
        logger.debug(f"Canceled {len(tasks)} tasks")

    tasks.add(asyncio.ensure_future(self.host.start()))
    self._main_task = asyncio.ensure_future(start())

    def handle_sigint():
      print("\r", end="", file=sys.stderr)
      logger.info("Exiting after receiving a SIGINT signal")

      self.stop()

    try:
      loop.add_signal_handler(signal.SIGINT, handle_sigint)
    except NotImplementedError: # For Windows
      pass

    try:
      loop.run_until_complete(self._main_task)
    finally:
      loop.close()
      self._main_task = None

  def stop(self):
    logger.info("Stopping")
    self._main_task.cancel()


def main():
  parser = argparse.ArgumentParser(description="PR–1 server")
  parser.add_argument("--data-dir")
  parser.add_argument("--local", action='store_true')

  args = parser.parse_args()

  app = App(data_dir=args.data_dir, local=args.local)
  app.start()

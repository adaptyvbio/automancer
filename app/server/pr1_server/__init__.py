import asyncio
import collections
from pathlib import Path
import appdirs
import json
import logging
import subprocess
import sys
import uuid
import websockets

from pr1 import Host, reader
from pr1.util import schema as sc

from .auth import agents as auth_agents
from .session import Session


logging.basicConfig(level=logging.DEBUG, format="%(levelname)-8s :: %(name)-18s :: %(message)s")
logger = logging.getLogger("pr1.app")

# for handler in logging.root.handlers:
#   handler.addFilter(logging.Filter("pr1"))


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

class Client:
  def __init__(self, *, authenticated, conn):
    self.authenticated = authenticated
    self.conn = conn
    self.sessions = dict()

  @property
  def id(self):
    return self.conn.id


conf_schema = sc.Schema({
  'authentication': sc.Optional(sc.List(
    sc.Or(*[Agent.conf_schema for Agent in auth_agents.values()])
  )),
  'features': {
    'multiple_clients': sc.ParseType(bool),
    'restart': sc.ParseType(bool),
    'terminal': sc.ParseType(bool),
    'write_config': sc.ParseType(bool)
  },
  'hostname': str,
  'port': sc.ParseType(int),
  'version': sc.ParseType(int)
})

class App():
  version = 1

  def __init__(self):
    self.data_dir = Path(appdirs.user_data_dir("PR-1", "Hsn"))
    self.data_dir.mkdir(exist_ok=True)

    # if not self.data_dir.exists():
    #   try:
    #     self.data_dir.mkdir()
    #   except PermissionError:
    #     if sys.stdout.isatty():
    #       print("Authenticate to create the data directory")
    #       code = subprocess.call(["sudo", "mkdir", "-p", str(self.data_dir)])

    #       if code != 0:
    #         print("Could not create the data directory")
    #         sys.exit(1)
    #     else:
    #       print("Run again as root or interactively to create the data directory")
    #       sys.exit(1)

    conf_path = self.data_dir / "app.yml"

    if conf_path.exists():
      try:
        conf = reader.loads((self.data_dir / "app.yml").open().read())
        conf = conf_schema.transform(conf)
      except reader.LocatedError as e:
        e.display()
        sys.exit(1)

      if conf['version'] > self.version:
        raise Exception("Incompatible version")

      updated_conf = False

      if 'authentication' in conf:
        for index, conf_method in enumerate(conf['authentication']):
          Agent = auth_agents[conf_method['type']]

          if hasattr(Agent, 'update_conf'):
            updated_conf_method = Agent.update_conf(conf_method)

            if updated_conf_method:
              conf['authentication'][index] = updated_conf_method
              updated_conf = True

    else:
      conf = {
        'features': {
          'multiple_clients': True,
          'restart': False,
          'terminal': False,
          'write_config': False
        },
        'hostname': "127.0.0.1",
        'port': 4567,
        'version': self.version
      }

      updated_conf = True

    if updated_conf:
      conf_path.open("w").write(reader.dumps(conf))

    self.conf = conf
    self.host = Host(backend=Backend(self), update_callback=self.update)
    self.clients = dict()
    self.server = None

    self.updating = False

    # id: hex(hash(json.dumps({ 'passwd': 'foobar' }, sort_keys=True)))[2:]
    self.auth_agents = [
      auth_agents[conf_method['type']](conf_method) for conf_method in conf['authentication']
    ] if 'authentication' in conf else None


  async def handle_client(self, client):
    await client.conn.send(json.dumps({
      "authMethods": [
        agent.export() for agent in self.auth_agents
      ] if self.auth_agents else None,
      "version": self.version
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

    await client.conn.send(json.dumps({
      "type": "state",
      "data": self.host.get_state()
    }))

    async for msg in client.conn:
      message = json.loads(msg)

      if message["type"] == "request":
        response_data = await self.process_request(client, message["data"])

        await client.conn.send(json.dumps({
          "type": "response",
          "id": message["id"],
          "data": response_data
        }))

  async def process_request(self, client, request):
    if request["type"] == "app.session.create":
      id = str(uuid.uuid4())
      session = Session(size=(request["size"]["columns"], request["size"]["rows"]))

      client.sessions[id] = session
      logger.info(f"Created terminal session with id '{id}'")

      async def start_session():
        try:
          async for chunk in session.start():
            await client.conn.send(json.dumps({
              "type": "app.session.data",
              "id": id,
              "data": list(chunk)
            }))

          del client.sessions[id]
          logger.info(f"Closed terminal session with id '{id}'")

          await client.conn.send(json.dumps({
            "type": "app.session.close",
            "id": id,
            "status": session.status
          }))
        except websockets.ConnectionClosed:
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
      return await self.host.process_request(request)

  def broadcast(self, message):
    websockets.broadcast([client.conn for client in self.clients.values()], message)

  def update(self):
    if not self.updating:
      self.updating = True

      def send_state():
        self.broadcast(json.dumps({
          "type": "state",
          "data": self.host.get_state()
        }))

        self.updating = False

      loop = asyncio.get_event_loop()
      loop.call_soon(send_state)

  def start(self):
    loop = asyncio.get_event_loop()

    # Debug
    # chip, codes, draft = self.host._debug()
    # self.host.start_plan(chip=chip, codes=codes, draft=draft, update_callback=self.update)

    loop.run_until_complete(self.host.initialize())

    # async def task():
    #   try:
    #     await asyncio.sleep(2)
    #     await self.server.close()
    #   except asyncio.CancelledError:
    #     print("Cancelled")
    # t = loop.create_task(task())
    # t = loop.create_task(task())

    loop.create_task(self.serve())
    loop.create_task(self.host.start())

    try:
      loop.run_forever()
    except KeyboardInterrupt:
      logger.info("Stopping due to a keyboard interrupt")

      tasks = asyncio.all_tasks(loop)
      logger.debug(f"Cancelling {len(tasks)} tasks")

      all_tasks = asyncio.gather(*tasks)
      all_tasks.cancel()

      try:
        loop.run_until_complete(all_tasks)
      except asyncio.CancelledError:
        pass

      # all_tasks.exception()
    finally:
      loop.close()

  async def serve(self):
    async def handler(conn):
      if self.conf['features']['multiple_clients'] and (len(self.clients) > 1):
        return

      client = Client(authenticated=False, conn=conn)
      self.clients[client.id] = client

      try:
        await self.handle_client(client)
      finally:
        for session in client.sessions.values():
          session.close()

        del self.clients[client.id]

    hostname = self.conf['hostname']
    port = self.conf['port']

    logger.debug(f"Websockets listening on {hostname}:{port}")

    self.server = await websockets.serve(handler, host=hostname, port=port)

    try:
      await self.server.wait_closed()
    except asyncio.CancelledError:
      self.server.close()
      # await self.server.wait_closed()


def main():
  app = App()
  app.start()

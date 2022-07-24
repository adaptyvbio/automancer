from pathlib import Path
import appdirs
import argparse
import asyncio
import collections
import json
import logging
import subprocess
import sys
import uuid
import websockets

from pr1 import Host, reader
from pr1.util import schema as sc

logger = logging.getLogger("pr1.app")

from .auth import agents as auth_agents
from .bridges.stdio import StdioBridge
from .bridges.websocket import WebsocketBridge
from .session import Session


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

conf_schema = sc.Schema({
  'features': {
    'multiple_clients': sc.ParseType(bool),
    'restart': sc.ParseType(bool),
    'terminal': sc.ParseType(bool),
    'write_config': sc.ParseType(bool)
  },
  'remote': sc.Optional({
    'authentication': sc.Optional(sc.List(
      sc.Or(*[Agent.conf_schema for Agent in auth_agents.values()])
    )),
    'hostname': str,
    'port': sc.ParseType(int)
  }),
  'version': sc.ParseType(int)
})

class App:
  version = 1

  def __init__(self, *, local):
    # Create data directory if missing

    self.data_dir = Path(appdirs.user_data_dir("PR-1", "Hsn"))
    self.data_dir.mkdir(exist_ok=True, parents=True)


    # Load or create configuration

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

      conf_updated = False
    else:
      conf = {
        'features': {
          'multiple_clients': True,
          'restart': False,
          'terminal': False,
          'write_config': False
        },
        **({ 'remote': {
          'hostname': "127.0.0.1",
          'port': 4567,
        } } if not local else dict()),
        'version': self.version
      }

      conf_updated = True


    # Create bridges

    self.bridges = set()

    if 'remote' in conf:
      conf_updated = conf_updated or WebsocketBridge.update_conf(conf['remote'])
      self.bridges.add(WebsocketBridge(self, conf=conf['remote']))

    if local:
      self.brdiges.add(StdioBridge(self))


    # Write configuration if it has been updated

    if conf_updated:
      logger.info("Writing app configuration")
      conf_path.open("w").write(reader.dumps(conf) + "\n")


    # Create host

    self.conf = conf
    self.host = Host(backend=Backend(self), update_callback=self.update)

    self.updating = False


  async def process_request(self, request, *, bridge, ref):
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
    logger.info("Starting app")

    loop = asyncio.get_event_loop()
    loop.run_until_complete(self.host.initialize())

    logger.debug(f"Initializing {len(self.bridges)} bridges")

    for bridge in self.bridges:
      loop.run_until_complete(bridge.initialize())

    tasks = set()

    for bridge in self.bridges:
      async def receive(message, *, ref = None):
        if not message:
          await bridge.send({
            "type": "state",
            "data": self.host.get_state()
          }, ref=ref)
        # elif message["type"] == "request":
        #   self.process_request(message["data"], bridge=bridge, ref=ref)

      task = loop.create_task(bridge.start(receive))
      tasks.add(task)

    task = loop.create_task(self.host.start())
    tasks.add(task)

    try:
      loop.run_forever()
    except KeyboardInterrupt:
      logger.info("Stopping due to a keyboard interrupt")
      logger.debug(f"Cancelling {len(tasks)} tasks")

      all_tasks = asyncio.gather(*tasks)
      all_tasks.cancel()

      try:
        loop.run_until_complete(all_tasks)
      except asyncio.CancelledError:
        pass

      logger.debug("Cancelled tasks")
    finally:
      loop.close()


def main():
  parser = argparse.ArgumentParser(description="PR–1 server")
  parser.add_argument("--local", action='store_true')

  args = parser.parse_args()

  app = App(local=args.local)
  app.start()

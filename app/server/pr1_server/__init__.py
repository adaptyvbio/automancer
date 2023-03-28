import argparse
import asyncio
import functools
import json
import logging
import os
import platform
import signal
import socket
import sys
import traceback
import uuid
from pathlib import Path
from typing import Optional

import zeroconf
from pr1 import Host
from pr1.util.misc import log_exception
from pr1.util.pool import Pool
from zeroconf import IPVersion
from zeroconf.asyncio import AsyncServiceInfo, AsyncZeroconf

logger = logging.getLogger("pr1.app")

from .bridges.protocol import BridgeAdvertisementInfo, ClientClosed, BaseClient
from .bridges.stdio import StdioBridge
from .bridges.websocket import WebsocketBridge
from .conf import Conf
from .session import Session
from .static import StaticServer
from .trash import trash as trash_file


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
      trash_file(path)


class App:
  def __init__(self, args: argparse.Namespace, /):
    self.args = args

    # Display information

    logger.info(f"Running process with id {os.getpid()}")
    logger.info(f"Running Python {sys.version}")
    logger.info(f"Running on platform {platform.platform()}")


    # Create data directory if missing

    self.data_dir = Path(args.data_dir).resolve()
    self.data_dir.mkdir(exist_ok=True, parents=True)

    self.certs_dir = self.data_dir / "certificates"
    conf_path = self.data_dir / "conf-branch.json"

    logger.debug(f"Storing data in '{self.data_dir}'")

    if args.initialize:
      logger.info("Initializing")

      self.conf = Conf.create()
      json.dump(self.conf.export(), sys.stdout)

      logger.info("Initialized")
      sys.exit()

    if args.conf:
      raw_conf = json.loads(args.conf)
    elif conf_path.exists():
      with conf_path.open() as conf_file:
        raw_conf = json.load(conf_file)
    else:
      logger.error("Missing configuration")
      sys.exit(1)

    self.conf = Conf.load(raw_conf)


    # Create authentication agents

    self.auth_agents = dict()

    # if 'authentication' in conf:
    #   for index, conf_method in enumerate(conf['authentication']):
    #     Agent = auth_agents[conf_method['type']]

    #     if hasattr(Agent, 'update_conf'):
    #       conf_updated_method = Agent.update_conf(conf_method)

    #       if conf_updated_method:
    #         conf['authentication'][index] = conf_updated_method
    #         conf_updated = True

    # self.auth_agents = [
    #   auth_agents[conf_method['type']](conf_method) for conf_method in conf['authentication']
    # ] if 'authentication' in conf else None


    # # Write configuration if it has been updated

    # if conf_updated:
    #   logger.info("Writing app configuration")
    #   conf_path.open("w").write(reader.dumps(conf) + "\n")


    # Create host

    self.clients = dict[str, BaseClient]()
    self.host = Host(
      backend=Backend(self),
      update_callback=self.update
    )


    # Create bridges and static server

    self.bridges = {bridge_conf.create_bridge(app=self) for bridge_conf in self.conf.bridges}
    self.owner_bridge = next((bridge for bridge in self.bridges if isinstance(bridge, StdioBridge)), None)

    self.static_server = StaticServer(self, conf=self.conf.static) if self.conf.static else None


    # Misc

    self.updating = False

    self._pool: Optional[Pool] = None
    self._stop_event: Optional[asyncio.Event] = None


  async def advertise(self):
    if self.conf.advertisement:
      infos = list[BridgeAdvertisementInfo]()

      for bridge in self.bridges:
        infos += bridge.advertise()

      zeroconf_services = [AsyncServiceInfo(
        f"_prone.{info.type}",
        f"{self.conf.identifier}._prone." + info.type,
        addresses=[socket.inet_aton(info.address)],
        port=info.port,
        properties={
          'description': self.conf.advertisement.description,
          'identifier': self.conf.identifier
        },
        server=f"{self.conf.identifier}.local"
      ) for info in infos]

      logger.debug(f"Registering {len(zeroconf_services)} zeroconf services")

      self.zeroconf = AsyncZeroconf(ip_version=IPVersion.V4Only)

      async def register_zeroconf_service(service: AsyncServiceInfo):
        assert self.zeroconf

        try:
          await self.zeroconf.async_register_service(service)
        except zeroconf._exceptions.NonUniqueNameException:
          logger.error(f"Failed to register zeroconf service '{service.key}'")
        else:
          zeroconf_services.append(service)

      await asyncio.gather(*[register_zeroconf_service(service) for service in zeroconf_services])

      logger.debug("Registered zeroconf services")

      try:
        await asyncio.Future()
      finally:
        logger.debug(f"Unregistering {len(zeroconf_services)} zeroconf services")

        background_tasks = await asyncio.gather(*[self.zeroconf.async_unregister_service(service) for service in zeroconf_services])
        await asyncio.gather(*background_tasks)
        await self.zeroconf.async_close()

        self.zeroconf = None
        zeroconf_services.clear()

        logger.debug("Unregistered zeroconf services")


  async def handle_client(self, client: BaseClient):
    try:
      logger.debug(f"Added client '{client.id}'")

      self.clients[client.id] = client
      requires_auth = self.auth_agents and client.remote

      await client.send({
        "type": "initialize",
        # "authMethods": [
        #   agent.export() for agent in self.auth_agents
        # ] if requires_auth else None,
        # "features": {},
        "identifier": self.conf.identifier,
        "staticUrl": (self.static_server.url if self.static_server else None),
        "version": self.conf.version
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
        match message["type"]:
          case "exit":
            logger.info("Exiting after receiving an exit message")

            assert self._pool
            self._pool.close()
          case "request":
            response_data = await self.process_request(client, message["data"])

            await client.send({
              "type": "response",
              "id": message["id"],
              "data": response_data
            })
    except ClientClosed:
      logger.debug(f"Disconnected client '{client.id}'")
    except asyncio.CancelledError:
      pass
    except Exception:
      traceback.print_exc()
    finally:
      del self.clients[client.id]
      logger.debug(f"Removed client '{client.id}'")

  async def broadcast(self, message):
    for client in list(self.clients.values()):
      try:
        await client.send(message)
      except ClientClosed:
        pass

  async def process_request(self, client, request):
    match request["type"]:
      case "isBusy":
        return (len(self.clients) >= 2) or self.host.busy()
      case _:
        return await self.host.process_request(request, client=client)

  def update(self):
    if not self.updating:
      self.updating = True

      async def send_state():
        try:
          await self.broadcast({
            "type": "state",
            "data": self.host.get_state_update()
          })

          self.updating = False
        except Exception:
          traceback.print_exc()

      loop = asyncio.get_event_loop()
      loop.create_task(send_state())

  async def start(self):
    try:
      await self.host.initialize()

      try:
        async with Pool.open() as pool:
          self._pool = pool

          def handle_sigint():
            print("\r", end="", file=sys.stderr)
            logger.info("Exiting after receiving a SIGINT signal")

            pool.close()

          loop = asyncio.get_event_loop()

          try:
            loop.add_signal_handler(signal.SIGINT, handle_sigint)
          except NotImplementedError: # For Windows
            pass

          ready_count = 0
          ready_event = asyncio.Event()

          def item_ready():
            nonlocal ready_count
            ready_count += 1

            if ready_count == (len(self.bridges) + (1 if self.static_server else 0)):
              ready_event.set()


          for bridge in self.bridges:
            pool.start_soon(bridge.start(self.handle_client, item_ready))

          if self.static_server:
            pool.start_soon(self.static_server.start(item_ready))

          pool.start_soon(self.host.start())

          logger.debug("Starting")
          await pool.start_soon(ready_event.wait())
          pool.start_soon(self.advertise())

          logger.debug("Started")

          bridge_infos = functools.reduce(lambda infos, bridge: infos + bridge.export_info(), self.bridges, list())

          if self.args.local:
            sys.stdout.write(json.dumps(bridge_infos) + "\n")
            sys.stdout.flush()
      finally:
        logger.debug("Deinitializing")
    except Exception:
      logger.error("Error")
      log_exception(logger)

    logger.debug("Stopped")


def main():
  parser = argparse.ArgumentParser(description="PR–1 server")

  parser.add_argument("--conf")
  parser.add_argument("--data-dir", required=True)
  parser.add_argument("--initialize", action='store_true')
  parser.add_argument("--local", action='store_true')

  args = parser.parse_args()


  app = App(args)

  loop = asyncio.get_event_loop()
  loop.run_until_complete(app.start())

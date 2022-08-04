import asyncio
import json
import random
import ssl
from collections import namedtuple

import aiohttp.web
import websockets
from OpenSSL import SSL, crypto

from .. import logger as parent_logger
from ..auth import agents as auth_agents
from ..client import BaseClient, ClientClosed


logger = parent_logger.getChild("bridges.websocket")

CertInfo = namedtuple("CertInfo", ["cert_path", "common_name", "expired", "fingerprint_sha1", "fingerprint_sha256", "key_path", "serial"])


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
    self.data_server = None


    # Certificate

    if self.conf.get('secure'):
      cert_dir = (self.app.data_dir / "certificate")
      cert_path = (cert_dir / "cert.pem")
      key_path = (cert_dir / "key.pem")

      hostname = self.conf['hostname']

      if cert_dir.exists():
        cert = crypto.load_certificate(crypto.FILETYPE_PEM, cert_path.open().read())
      else:
        logger.info(f"Generating a self-signed certificate for hostname '{hostname}'")

        private_key = crypto.PKey()
        private_key.generate_key(crypto.TYPE_RSA, 4096)

        cert = crypto.X509()
        cert.get_subject().CN = hostname
        cert.gmtime_adj_notBefore(0)
        cert.gmtime_adj_notAfter(10 * 365 * 24 * 3600)
        cert.set_serial_number(random.randrange(16 ** 17, 16 ** 18))
        cert.set_issuer(cert.get_subject())
        cert.set_pubkey(private_key)
        cert.sign(private_key, 'sha512')

        cert_dir.mkdir()

        with cert_path.open("wb") as cert_file:
          cert_file.write(crypto.dump_certificate(crypto.FILETYPE_PEM, cert))

        with key_path.open("wb") as key_file:
          key_file.write(crypto.dump_privatekey(crypto.FILETYPE_PEM, private_key))

      self.cert_info = CertInfo(
        cert_path=cert_path,
        common_name=cert.get_issuer().CN,
        expired=cert.has_expired(),
        fingerprint_sha1=cert.digest("sha1").decode("utf-8"),
        fingerprint_sha256=cert.digest("sha256").decode("utf-8"),
        key_path=key_path,
        serial=cert.get_serial_number()
      )

      if self.cert_info.expired:
        logger.error("The certificate has expired and will be ignored.")
        self.cert_info = None
      elif self.cert_info.common_name != hostname:
        logger.error(f"The certificate's hostname '{self.cert_info.common_name}' does not match the configured hostname '{hostname}'.")
        logger.error("It will be ignored.")
        self.cert_info = None
      else:
        serial_raw = f"{self.cert_info.serial:018X}"
        serial_formatted = ":".join(serial_raw[i:(i + 2)] for i in range(0, len(serial_raw), 2))

        logger.debug(f"Using certificate with serial number '{serial_formatted}'")
    else:
      self.cert_info = None
      logger.warn("Not using a secure HTTP connection")


    # Static server

    @aiohttp.web.middleware
    async def middleware(request, handler):
      if self.conf.get('static_authenticate_clients'):
        authorization = request.headers.get('Authorization')

        if (authorization is None) or (not any(client.id == authorization for client in self.clients)):
          return aiohttp.web.Response(status=403, text="Invalid authorization header")

      return await handler(request)

    self.static_app = aiohttp.web.Application(middlewares=[middleware])

    self.static_app.add_routes([
      *[aiohttp.web.static(f"/{name}/{unit.version}", unit.client_path) for name, unit in self.app.host.units.items() if hasattr(unit, 'client_path')]
    ])

    self.static_runner = aiohttp.web.AppRunner(self.static_app)
    self.static_site = None
    self.static_url = None


  async def initialize(self):
    await self.static_runner.setup()

  async def start(self, handle_client):
    # Data server

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
    data_port = self.conf['port']
    static_port = self.conf.get('static_port', data_port + 1)

    logger.debug(f"Data server listening on {hostname}:{data_port}")
    logger.debug(f"Static server listening on {hostname}:{static_port}")

    self.static_url = ("https" if self.cert_info else "http") + f"://{hostname}:{static_port}"


    # Static server

    if self.cert_info:
      ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
      ssl_context.load_cert_chain(self.cert_info.cert_path, self.cert_info.key_path)
    else:
      ssl_context = None

    self.static_site = aiohttp.web.TCPSite(self.static_runner, hostname, port=static_port, ssl_context=ssl_context)
    self.data_server = await websockets.serve(handler, host=hostname, port=data_port, ssl=ssl_context)


    # Start

    try:
      await asyncio.gather(
        self.data_server.wait_closed(),
        self.static_site.start()
      )
    except asyncio.CancelledError:
      await self.static_runner.cleanup()

      self.data_server.close()
      await self.data_server.wait_closed()
    finally:
      logger.debug("Done closing bridge")

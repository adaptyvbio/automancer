from asyncio import Server, StreamReader, StreamWriter
from ipaddress import ip_address as parse_ip_address
import asyncio
from collections import deque
from dataclasses import dataclass
import json
from pathlib import Path
import ssl
from typing import TYPE_CHECKING, Optional
import uuid

from pr1.util.pool import Pool

from .. import logger as parent_logger
from ..certificate import use_certificate
from ..util import IPAddress
from .protocol import BridgeAdvertisementInfo, BridgeProtocol, ClientClosed, BaseClient

if TYPE_CHECKING:
  from .. import App


logger = parent_logger.getChild("bridges.socket")


class Client(BaseClient):
  privileged = False
  remote = False

  def __init__(self, reader: StreamReader, writer: StreamWriter, /, bridge: 'SocketBridge'):
    super().__init__()

    self.id = str(uuid.uuid4())

    self._reader = reader
    self._writer = writer

    self._data_buffer = str()
    self._bridge = bridge
    self._message_buffer = deque[bytes]()

  async def recv(self):
    if self._message_buffer:
      return self._message_buffer.popleft()

    while True:
      try:
        data = await self._reader.read(0x10000)
      except ConnectionResetError as e:
        raise ClientClosed from e

      if not data:
        raise ClientClosed

      *msgs, self._data_buffer = (self._data_buffer + data.decode("utf-8")).split("\n")

      if not msgs:
        continue

      message, *messages = [json.loads(msg) for msg in msgs]
      self._message_buffer += messages

      return message

  async def send(self, message: object, /):
    try:
      self._writer.write((json.dumps(message) + "\n").encode("utf-8"))
    except BrokenPipeError as e:
      raise ClientClosed from e


@dataclass(kw_only=True)
class SocketBridgeTcpOptions:
  addresses: list[IPAddress]
  port: int

@dataclass
class SocketBridgeUnixOptions:
  path: Path

SocketBridgeOptions = SocketBridgeTcpOptions | SocketBridgeUnixOptions


@dataclass
class SocketBridgeTcpEffectiveOptions:
  pairs: list[tuple[IPAddress, int]]

@dataclass
class SocketBridgeUnixEffectiveOptions:
  path: Path

SocketBridgeEffectiveOptions = SocketBridgeTcpEffectiveOptions | SocketBridgeUnixEffectiveOptions


class SocketBridge(BridgeProtocol):
  def __init__(self, options: SocketBridgeOptions, *, app: 'App', secure: bool):
    self._app = app
    self._effective_options: SocketBridgeEffectiveOptions
    self._options = options

    if secure:
      self._cert_info = use_certificate(
        app.certs_dir,
        addresses=(options.addresses if isinstance(options, SocketBridgeTcpOptions) else None),
        logger=logger
      )

      if not self._cert_info:
        logger.error("Failed to obtain a certificate")
    else:
      self._cert_info = None

      if isinstance(options, SocketBridgeTcpOptions) and any(not address.is_loopback for address in options.addresses):
        logger.warning("Not using a secure connection")

  def advertise(self):
    if isinstance(self._effective_options, SocketBridgeTcpEffectiveOptions):
      return [BridgeAdvertisementInfo(
        type="_tcp.local.",
        address=address,
        port=port
      ) for address, port in self._effective_options.pairs if address.version == 4]
    else:
      return list[BridgeAdvertisementInfo]()

  async def start(self, handle_client):
    server: Optional[Server] = None

    try:
      async with Pool.open(forever=True) as pool:
        async def handle_connection(reader: StreamReader, writer: StreamWriter):
          try:
            await handle_client(Client(reader, writer, bridge=self))
          finally:
            writer.close()

        def handle_connection_sync(reader: StreamReader, writer: StreamWriter):
          pool.start_soon(handle_connection(reader, writer))

        if self._cert_info:
          ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
          ssl_context.load_cert_chain(self._cert_info.cert_path, self._cert_info.key_path)
        else:
          ssl_context = None

        match self._options:
          case SocketBridgeTcpOptions():
            server = await asyncio.start_server(
              handle_connection_sync,
              [str(address) for address in self._options.addresses],
              port=self._options.port,
              ssl=ssl_context
            )

            self._effective_options = SocketBridgeTcpEffectiveOptions([
              (parse_ip_address(raw_address), port) for raw_address, port, *_ in [socket.getsockname() for socket in server.sockets]
            ])

            for address, port in self._effective_options.pairs:
              logger.debug(f"Listening on {address}:{port}")

          case SocketBridgeUnixOptions():
            self._options.path.parent.mkdir(exist_ok=True, parents=True)
            self._options.path.unlink(missing_ok=True)

            server = await asyncio.start_unix_server(
              handle_connection_sync,
              self._options.path,
              ssl=ssl_context
            )

            self._effective_options = SocketBridgeUnixEffectiveOptions(
              Path(server.sockets[0].getsockname())
            )

            logger.debug(f"Listening on {self._effective_options.path}")

        yield
    finally:
      if server:
        server.close()
        await server.wait_closed()

      logger.debug("Stopped")

  def export_info(self):
    match self._effective_options:
      case SocketBridgeTcpEffectiveOptions():
        return [{
          "type": "tcp",
          "hostname": str(address),
          "identifier": self._app.conf.identifier,
          "password": None,
          "port": port,
          "secure": False
        } for address, port in self._effective_options.pairs]
      case SocketBridgeUnixEffectiveOptions():
        return [{
          "type": "unix",
          "identifier": self._app.conf.identifier,
          "path": str(self._effective_options.path),
          "password": None,
          "secure": False
        }]

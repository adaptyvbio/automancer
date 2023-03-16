from asyncio import Future, StreamReader, StreamWriter
import asyncio
from collections import deque
import json
from pathlib import Path
import socket
import ssl
import sys
import threading
from typing import TYPE_CHECKING, Any, Optional
import uuid

from pr1.util.pool import Pool

from .. import logger as parent_logger
from ..certificate import use_certificate
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


class SocketBridge(BridgeProtocol):
  def __init__(self, *, address: Any, app: 'App', family: int, secure: bool):
    self._address = address
    self._family = family
    self._tasks = dict[str, asyncio.Task]()

    if secure:
      self._cert_info = use_certificate(app.certs_dir, hostname=(self._address[0] if family == socket.AF_INET else None), logger=logger)

      if not self._cert_info:
        logger.error("Failed to obtain a certificate")
    else:
      self._cert_info = None

      if family != socket.AF_UNIX:
        # TODO: Remove warning when hostname is localhost or 127.0.0.1
        # https://docs.python.org/3/library/ipaddress.html#ipaddress.IPv4Network.is_private
        logger.warning("Not using a secure connection")

  def advertise(self):
    if self._family != socket.AF_INET:
      return list[BridgeAdvertisementInfo]()

    hostname, port = self._address

    return [BridgeAdvertisementInfo(
      type="_tcp.local.",
      address=hostname,
      port=port
    )]

  async def initialize(self):
    pass

  async def start(self, handle_client):
    server: Optional[asyncio.Server] = None

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

        if self._family == socket.AF_UNIX:
          server = await asyncio.start_unix_server(handle_connection_sync, self._address, ssl=ssl_context)
          logger.debug(f"Listening on {self._address}")
        else:
          hostname, port = self._address
          server = await asyncio.start_server(handle_connection_sync, hostname, port, family=self._family, ssl=ssl_context)
          logger.debug(f"Listening on {hostname}:{port}")

        logger.debug("Started")
    finally:
      if server:
        server.close()
        await server.wait_closed()

      logger.debug("Stopped")

  @classmethod
  def inet(cls, host: str, port: int, *, app: 'App'):
    return cls(
      app=app,

      address=(host, port),
      family=socket.AF_INET,
      secure=True
    )

  @classmethod
  def unix(cls, raw_path: str, /, *, app: 'App'):
    path = Path(raw_path)
    path.parent.mkdir(exist_ok=True, parents=True)
    path.unlink(missing_ok=True)

    return cls(
      app=app,

      address=str(path),
      family=socket.AF_UNIX,
      secure=False
    )

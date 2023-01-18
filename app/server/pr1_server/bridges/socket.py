import asyncio
from collections import deque
import json
from pathlib import Path
import socket
import sys
import threading
from typing import Any, Optional
import uuid

from .protocol import BridgeAdvertisementInfo, BridgeProtocol, ClientClosed, ClientProtocol


class Client(ClientProtocol):
  privileged = False
  remote = False

  def __init__(self, client_socket: socket.socket, /, bridge: 'SocketBridge'):
    super().__init__()

    self.id = str(uuid.uuid4())

    self._data_buffer = str()
    self._bridge = bridge
    self._message_buffer = deque()
    self._socket = client_socket

  def close(self):
    self._socket.close()
    del self._bridge._tasks[self.id]

  async def recv(self):
    if self._message_buffer:
      return self._message_buffer.popleft()

    loop = asyncio.get_event_loop()

    while True:
      try:
        data = await loop.sock_recv(self._socket, 0x10000)
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
    loop = asyncio.get_event_loop()

    try:
      await loop.sock_sendall(self._socket, (json.dumps(message) + "\n").encode("utf-8"))
    except BrokenPipeError as e:
      raise ClientClosed from e


class SocketBridge(BridgeProtocol):
  def __init__(self, *, address: Any, family: int):
    self._address = address
    self._family = family
    self._server: socket.socket
    self._tasks = dict[str, asyncio.Task]()

  def advertise(self):
    if self._family != socket.AF_INET:
      return list()

    host, port = self._address

    return [BridgeAdvertisementInfo(
      type="_tcp.local.",
      address=host,
      port=port
    )]

  async def initialize(self):
    self._server = socket.socket(self._family, socket.SOCK_STREAM)
    self._server.bind(self._address)
    self._server.listen(8)
    self._server.setblocking(False)

  async def start(self, handle_client):
    loop = asyncio.get_event_loop()

    try:
      while True:
        socket_client, _ = await loop.sock_accept(self._server)
        client = Client(socket_client, bridge=self)
        self._tasks[client.id] = asyncio.create_task(handle_client(client))
    except asyncio.CancelledError:
      for task in list(self._tasks.values()):
        task.cancel()

        try:
          await task
        except asyncio.CancelledError:
          pass

      self._tasks.clear()
    finally:
      self._server.close()

  @classmethod
  def inet(cls, host: str, port: int):
    return cls(
      address=(host, port),
      family=socket.AF_INET
    )

  @classmethod
  def unix(cls, raw_path: str, /):
    path = Path(raw_path)
    path.parent.mkdir(exist_ok=True, parents=True)
    path.unlink(missing_ok=True)

    return cls(
      address=str(path),
      family=socket.AF_UNIX
    )

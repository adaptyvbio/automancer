from dataclasses import dataclass
from typing import Any, Literal, Optional, Protocol
import uuid

from .bridges.protocol import BridgeProtocol
from .bridges.socket import SocketBridge
from .bridges.stdio import StdioBridge
from .bridges.websocket import WebsocketBridge


VERSION = 5

class VersionMismatch(Exception):
  pass


@dataclass(kw_only=True)
class ConfAuthDetailsPassword:
  password: str
  type: Literal['password']

ConfAuthDetails = ConfAuthDetailsPassword

class ConfAuthMethod:
  details: ConfAuthDetails
  label: str

@dataclass(kw_only=True)
class ConfAuth:
  methods: list[ConfAuthMethod]

  def export(self):
    return {}

  @classmethod
  def create(cls):
    return cls(
      methods=list()
    )

  @classmethod
  def load(cls, data):
    return cls(
      methods=[]
    )


class ConfBridge(Protocol):
  def create_bridge(self, *, app) -> BridgeProtocol:
    ...

  def export(self) -> Any:
    ...

  @staticmethod
  def load(data):
    match data["type"]:
      case "socket":
        return ConfBridgeSocket.load(data["options"])
      case "stdio":
        return ConfBridgeStdio.load(data["options"])
      case "websocket":
        return ConfBridgeWebsocket.load(data["options"])
      case _:
        raise ValueError

class ConfBridgeSocket:
  @staticmethod
  def load(data):
    match data["type"]:
      case "inet":
        return ConfBridgeSocketInet(
          hostname=data["hostname"],
          port=data["port"],
          secure=data["secure"]
        )
      case "unix":
        return ConfBridgeSocketUnix(
          path=data["path"]
        )
      case _:
        raise ValueError

@dataclass(kw_only=True)
class ConfBridgeSocketInet(ConfBridge):
  hostname: str
  port: int
  secure: bool

  def create_bridge(self, *, app):
    return SocketBridge.inet(self.hostname, self.port, app=app, secure=self.secure)

  def export(self):
    return {
      "type": "socket",
      "options": {
        "type": "inet",
        "hostname": self.hostname,
        "port": self.port
      }
    }

@dataclass(kw_only=True)
class ConfBridgeSocketUnix(ConfBridge):
  path: str

  def create_bridge(self, *, app):
    return SocketBridge.unix(self.path, app=app)

  def export(self):
    return {
      "type": "socket",
      "options": {
        "type": "unix",
        "path": self.path
      }
    }

@dataclass(kw_only=True)
class ConfBridgeStdio(ConfBridge):
  def create_bridge(self, *, app):
    return StdioBridge(app=app)

  def export(self):
    return {
      "type": "stdio"
    }

  @classmethod
  def load(cls, data):
    return cls()

@dataclass(kw_only=True)
class ConfBridgeWebsocket(ConfBridge):
  hostname: str
  port: int
  secure: bool
  single_client: bool

  def create_bridge(self, *, app):
    return WebsocketBridge(app, conf=self)

  def export(self):
    return {
      "type": "websocket",
      "options": {
        "hostname": self.hostname,
        "port": self.port,
        "secure": self.secure,
        "singleClient": self.single_client
      }
    }

  @classmethod
  def load(cls, data):
    return cls(
      hostname=data["hostname"],
      port=data["port"],
      secure=data["secure"],
      single_client=data["singleClient"]
    )


@dataclass(kw_only=True)
class ConfAdvertisement:
  description: str

  def export(self):
    return {
      "description": self.description
    }

  @classmethod
  def load(cls, data):
    return cls(
      description=data["description"]
    )


@dataclass(kw_only=True)
class ConfStatic:
  hostname: str
  port: int
  secure: bool

  def export(self):
    return {
      "hostname": self.hostname,
      "port": self.port,
      "secure": self.secure
    }

  @classmethod
  def load(cls, data):
    return cls(
      hostname=data["hostname"],
      port=data["port"],
      secure=data["secure"]
    )


@dataclass(kw_only=True)
class Conf:
  advertisement: Optional[ConfAdvertisement]
  auth: ConfAuth
  bridges: list[ConfBridge]
  identifier: str
  static: Optional[ConfStatic]
  version: int

  def export(self):
    return {
      "advertisement": (self.advertisement and self.advertisement.export()),
      "auth": self.auth.export(),
      "bridges": [bridge.export() for bridge in self.bridges],
      "identifier": self.identifier,
      "static": (self.static and self.static.export()),
      "version": self.version
    }

  @classmethod
  def create(cls):
    return cls(
      advertisement=None,
      auth=ConfAuth.create(),
      bridges=list(),
      identifier=str(uuid.uuid4()),
      static=None,
      version=VERSION
    )

  @classmethod
  def load(cls, data):
    if data["version"] != VERSION:
      raise VersionMismatch()

    return cls(
      advertisement=(data["advertisement"] and ConfAdvertisement.load(data["advertisement"])),
      auth=ConfAuth.load(data["auth"]),
      bridges=[ConfBridge.load(data_bridge) for data_bridge in data["bridges"]],
      identifier=data["identifier"],
      static=(data["static"] and ConfStatic.load(data["static"])),
      version=data["version"]
    )

from dataclasses import dataclass
from typing import Literal, Optional
import uuid


VERSION = 3

class VersionMismatch(Exception):
  pass


@dataclass
class ConfAuthDetailsPassword:
  password: str
  type: Literal['password']

ConfAuthDetails = ConfAuthDetailsPassword

class ConfAuthMethod:
  details: ConfAuthDetails
  label: str


@dataclass
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

@dataclass
class ConfRemote:
  hostname: str
  port: int
  secure: bool
  single_client: bool
  static_authenticate_clients: bool
  static_port: int

  def export(self):
    return {
      "hostname": self.hostname,
      "port": self.port,
      "secure": self.secure,
      "singleClient": self.single_client,
      "staticAuthenticateClients": self.static_authenticate_clients,
      "staticPort": self.static_port
    }

  @classmethod
  def load(cls, data):
    return cls(
      hostname=data["hostname"],
      port=data["port"],
      secure=data["secure"],
      single_client=data["singleClient"],
      static_authenticate_clients=data["staticAuthenticateClients"],
      static_port=data["staticPort"]
    )


@dataclass
class Conf:
  auth: ConfAuth
  identifier: str
  remote: Optional[ConfRemote]
  version: int

  def export(self):
    return {
      "auth": self.auth.export(),
      "identifier": self.identifier,
      "remote": self.remote.export() if self.remote else None,
      "version": self.version
    }

  @classmethod
  def create(cls):
    return cls(
      auth=ConfAuth.create(),
      identifier=str(uuid.uuid4()),
      remote=None,
      version=VERSION
    )

  @classmethod
  def load(cls, data):
    if data["version"] != VERSION:
      raise VersionMismatch()

    return cls(
      auth=ConfAuth.load(data["auth"]),
      identifier=data["identifier"],
      remote=(ConfRemote.load(data["remote"]) if data["remote"] else None),
      version=data["version"]
    )

from asyncio import Future
import ssl
from typing import TYPE_CHECKING
from aiohttp.abc import AbstractAccessLogger
import aiohttp.web

from pr1.util.types import SimpleCallbackFunction

from . import logger as parent_logger
from .certificate import use_certificate
from .conf import ConfStatic

if TYPE_CHECKING:
  from . import App


logger = parent_logger.getChild("static")


class AccessLogger(AbstractAccessLogger):
  def log(self, request, response, time):
    self.logger.debug(f"{request.method} {request.path} -> {response.status}")


class StaticServer:
  def __init__(self, app: 'App', *, conf: ConfStatic):
    self._app = app
    self._conf = conf

    if conf.secure:
      self._cert_info = use_certificate(app.certs_dir, hostname=conf.hostname, logger=logger)

      if not self._cert_info:
        logger.error("Failed to obtain a certificate")
    else:
      self._cert_info = None

  async def start(self):
    @aiohttp.web.middleware
    async def middleware(request, handler):
      res = await handler(request)
      res.headers['Access-Control-Allow-Origin'] = '*'

      return res

    self._application = aiohttp.web.Application(middlewares=[middleware])
    self._application.add_routes([aiohttp.web.static(f"/{namespace}/{unit.version}", unit.client_path) for namespace, unit in self._app.host.plugins.items() if hasattr(unit, 'client_path')])

    runner = aiohttp.web.AppRunner(self._application, access_log_class=AccessLogger)
    await runner.setup()

    if self._cert_info:
      ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
      ssl_context.load_cert_chain(self._cert_info.cert_path, self._cert_info.key_path)
    else:
      ssl_context = None

    try:
      self._site = aiohttp.web.TCPSite(runner, self._conf.hostname, port=0, ssl_context=ssl_context)
      await self._site.start()

      hostname, port = self._site._server.sockets[0].getsockname() # type: ignore
      logger.debug(f"Listening on {hostname}:{port}")

      self.url = ("https" if self._cert_info else "http") + f"://{hostname}:{port}"

      yield
      await Future()
    finally:
      await runner.cleanup()

import asyncio
import json
import socket
import websockets
from zeroconf import ServiceBrowser, Zeroconf


class HostManager:
  def add(self, uri):
    async def connect():
      async with websockets.connect(uri) as conn:
        await conn.send(json.dumps({ 'type': "upgrade" }))

        # async for message in conn:
        #   print(message)

    asyncio.run(connect())


manager = HostManager()


class Listener:
  def remove_service(self, zeroconf, type, name):
    print("Service %s removed" % (name,))
    info = zeroconf.get_service_info(type, name)
    print(info)

  def update_service(self, zeroconf, type, name):
    pass

  def add_service(self, zeroconf, type, name):
    info = zeroconf.get_service_info(type, name)
    host = socket.inet_ntoa(info.addresses[0])
    props = { key.decode("utf-8"): value.decode("utf-8") for key, value in info.properties.items() }
    uri = f"ws://{host}:{info.port}"

    print(f"Service {name}")
    print(uri)
    print(props)

    manager.add(uri)



zeroconf = Zeroconf()
listener = Listener()
browser = ServiceBrowser(zeroconf, "_dsprn._tcp.local.", listener)

try:
  print("Waiting")
  while True: pass
except KeyboardInterrupt:
  pass
finally:
  print("Closing")
  zeroconf.close()

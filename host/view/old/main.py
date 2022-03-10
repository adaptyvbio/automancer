import argparse
import asyncio
import json
import os
from pathlib import Path
import socket
import sys
import uuid
import websockets
from zeroconf import IPVersion, ServiceInfo, Zeroconf



parser = argparse.ArgumentParser(description="Remote control software")
parser.add_argument("--upgrade", action="store_true")
# parser.add_argument("--port", type=int, help="Port", required=True)

def get_ip():
  import socket

  s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
  s.connect(("8.8.8.8", 80))
  ip = s.getsockname()[0]
  s.close()

  return ip


class Application:
  version = "0"

  def __init__(self):
    self._clients = set()
    self._dir = Path.cwd() / "data"
    self._host = get_ip()
    self._upgrade_after = False

    self._config = None
    self._config_path = self._dir / "config.json"

    self._load_config()

    if self._config['version'] != Application.version:
      self._upgrade_config()


  # Configuration

  def _load_config(self):
    if self._config_path.exists():
      self._config = json.load(self._config_path.open())
    else:
      self._save_config({
        'id': str(uuid.uuid4()),
        'version': Application.version,
        'port': 4567
      })

  def _save_config(self, config = None):
    if config:
      self._config = config

    json.dump(self._config, self._config_path.open(mode="w"))

  def _upgrade_config(self):
    # ...

    self._config['version'] = Application.version
    self._save_config()


  # Routine

  def advertise(self):
    zeroconf = Zeroconf()
    info = ServiceInfo(
      "_dsprn._tcp.local.",
      "_dsprn._tcp.local.",
      addresses=[socket.inet_aton(self._host)],
      port=self._config['port'],
      properties={"id": self._config['id'], "version": self._config['version']},
      server=f"{self._config['id']}.local."
    )

    print("Preparing")
    zeroconf.register_service(info)
    print("Registered")

    def unregister():
      zeroconf.unregister_service(info)
      zeroconf.close()
      print("Unregistered")

    return unregister


  async def serve(self):
    async def handler(client):
      self._clients.add(client)

      try:
        # await client.send("foo")
        # await client.send("bar")

        async for message in client:
          msg = json.loads(message)

          if msg['type'] == "upgrade":
            self._upgrade_after = True
            stop.set_result(None)

          print(msg)
      finally:
        self._clients.remove(client)

        # while True:
        #   message = await client.recv()
        #   print(message)

    stop = asyncio.Future()

    async with websockets.serve(handler, host=self._host, port=self._config['port']):
      await stop

    print("Done")


  # Start

  def start(self):
    unregister = app.advertise()

    try:
      asyncio.run(app.serve())
    except KeyboardInterrupt:
      pass
    finally:
      unregister()

    if self._upgrade_after:
      self._start_upgrade()

  def _start_upgrade(self):
    import subprocess

    subprocess.Popen([sys.executable, sys.argv[0], '--upgrade'],
      stdout=open('out.log', 'w'),
      preexec_fn=os.setpgrp
    )




# ---


args = parser.parse_args()


print("PID", os.getpid())
# import sys
# print(sys.executable)

if args.upgrade:
  print("--> Upgrade <--")
  import sys
  sys.exit()


# from signal import SIGINT, SIGTERM
# loop = asyncio.get_event_loop()

# main_task = asyncio.ensure_future(main())

# for signal in [SIGINT, SIGTERM]:
#   loop.add_signal_handler(signal, main_task.cancel)

# try:
#   loop.run_until_complete(main_task)
# finally:
#   loop.close()

app = Application()
app.start()

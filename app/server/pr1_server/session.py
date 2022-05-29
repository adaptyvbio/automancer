import asyncio
import os
import pty
import subprocess


class Session:
  def __init__(self, size):
    self._master = None
    self._proc = None
    self._size = size

  @property
  def status(self):
    return self._proc.poll()

  async def start(self):
    master, slave = pty.openpty()
    self._master = master

    self._proc = subprocess.Popen(["fish"], stdout=slave, stderr=slave, stdin=slave, universal_newlines=True, preexec_fn=os.setsid, shell=True, close_fds=True, env={
      **os.environ,
      "COLUMNS": str(self._size[0]),
      "COLS": str(self._size[0]),
      "LINES": str(self._size[1])
    })

    os.close(slave)

    loop = asyncio.get_event_loop()
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await loop.connect_read_pipe(lambda: protocol, os.fdopen(master, mode="rb"))

    while self._proc.poll() is None:
      data = await reader.read(100)

      # 'data' is an empty bytes object when the process terminates.
      if len(data) > 0:
        yield data

    # print(res.decode("utf-8"), end="")

  def close(self):
    self._proc.kill()

  def write(self, data):
    os.write(self._master, data)

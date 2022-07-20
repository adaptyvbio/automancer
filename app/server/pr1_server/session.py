import array
import asyncio
import fcntl
import os
import pty
import subprocess
import termios


class Session:
  def __init__(self, size):
    self._master = None
    self._proc = None
    self._size = size # (columns, rows)

  @property
  def status(self):
    return self._proc.poll()

  def resize(self, new_size = None):
    if new_size:
      self._size = new_size

    buf = array.array('H', [self._size[1], self._size[0], 0, 0])
    fcntl.ioctl(self._master, termios.TIOCSWINSZ, buf)

  async def start(self):
    master, slave = pty.openpty()
    self._master = master

    self._proc = subprocess.Popen(["fish"], stdout=slave, stderr=slave, stdin=slave, universal_newlines=True, preexec_fn=os.setsid, shell=True, close_fds=True, cwd=os.environ["HOME"])

    os.close(slave)

    self.resize()

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

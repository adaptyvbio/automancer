import asyncio
import appdirs
import logging
from pathlib import Path
from pprint import pprint

from .host import Host

class ColoredFormatter(logging.Formatter):
  def format(self, record):
    reset = "\x1b[0m"
    color = {
      logging.CRITICAL: "\x1b[31;1m",
      logging.INFO: "\x1b[34;20m",
      logging.ERROR: "\x1b[31;20m",
      logging.WARNING: "\x1b[33;20m"
    }.get(record.levelno, str())

    formatter = logging.Formatter(f"{color}%(levelname)-8s{reset} :: %(name)-18s :: %(message)s")
    return formatter.format(record)

ch = logging.StreamHandler()
ch.setFormatter(ColoredFormatter())

logging.getLogger().addHandler(ch)
logging.getLogger().setLevel(logging.INFO)
logging.getLogger("pr1").setLevel(logging.DEBUG)


logger = logging.getLogger("pr1.test")

class Backend:
  def __init__(self) -> None:
    self.data_dir = Path(appdirs.user_data_dir("PR-1", "Hsn"))
    self.data_dir = Path("tmp/master-host")
    logger.debug(f"Storing data in '{self.data_dir}'")


def callback(data):
  print("Update ->", data)


host = Host(backend=Backend(), update_callback=callback)


async def main():
  # async def task_counter():
  #   while True:
  #     print(f"Task count: {len(asyncio.all_tasks())}")
  #     await asyncio.sleep(0.2)

  # asyncio.create_task(task_counter())


  await host.initialize()

  from .fiber.parser import FiberParser

  parser = FiberParser("""
name: Foobar

steps:
  wait: 1s
  PLC.S00: 3.66 psi

  # actions:
  #   - activate: 1s
  #   - activate: 1s
  # Mock.valueBool: true

  # repeat: 3
  # actions:
  #   - activate: 1 s
  #     Mock.valueBool: true
  #     repeat: 2
  # Mock.valueBool: false
  # repeat: 1

    # - activate: 1 s
    #   Mock.valueBool: false
    # - activate: 1 s
""",
    host=host,
    Parsers=host.manager.Parsers
  )


  # return

  from .fiber.master2 import Master

  chip = next(iter(host.chips.values()))
  # chip.upgrade(host=host)

  if parser.protocol:
    master = Master(parser.protocol, chip=chip)

    async def a():
      async for info in master.run():
        # continue

        print("[Info]")
        print("  Raw:", info)
        print("  Exported:", info.location.export())
        print()

    async def b():
      # node = host.root_node.nodes['Mock'].nodes['valueBool']
      # await asyncio.sleep(2)
      # claim = node.claim_now(force=True)
      # await asyncio.sleep(2)
      # claim.release()

      print("[Pausing]")
      await asyncio.sleep(0.5)
      master.halt()
      # master.pause()
      # await asyncio.sleep(1)
      # print("[Resuming]")
      # master.resume()
      pass


    # print()
    print("--------")
    print()

    await asyncio.gather(a(), b())
    # await a()



asyncio.run(main())

import asyncio
import logging
from pathlib import Path
from pprint import pprint
import signal

from .devices.claim import ClaimSymbol
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
    self.data_dir = Path("tmp/master-host").resolve()
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

  from .document import Document
  from .draft import Draft
  from .fiber.parser import FiberParser

  document = Document.text("""
name: Test

steps:
  wait: 1 sec
  # actions:
  #   - wait: 2 sec
  #   # - wait: 2 sec
  PLC.A1: 5
""")

  draft = Draft(
    documents=[document],
    entry_document_id=document.id,
    id="a"
  )

  parser = FiberParser(
    draft,
    host=host,
    Parsers=host.manager.Parsers
  )

  # print(parser.analysis)

  if parser.protocol:
    print(parser.protocol.root.format_hierarchy())

  # return

  from .fiber.master2 import Master

  experiment = next(iter(host.experiments.values()))
  # chip.upgrade(host=host)

  if parser.protocol:
    master = Master(parser.protocol, experiment=experiment, host=host)

    # Remove the root state block
    # parser.protocol.root = parser.protocol.root.child # type: ignore
    # parser.protocol.root._children = [block.child for block in parser.protocol.root._children]

    def update_callback():
      pass

    async def a():
      done = asyncio.create_task(master.done())

      loop = asyncio.get_event_loop()
      loop.add_signal_handler(signal.SIGINT, master.halt)

      await master.run(update_callback)
      await done

      loop.remove_signal_handler(signal.SIGINT)

      # async for info in master.run():
      #   # continue

      #   # print("[Info]")
      #   # print("  Raw:", info)
      #   # print("  Exported:", info.location.export())
      #   # print()

      #   pass

    async def b():
      pass

      # await asyncio.sleep(1.0)
      # print("\n= PAUSING\n")
      # master._program._child_program._child_program._child_program.pause()
      # await asyncio.sleep(0.5)
      # print("\n= HALTING\n")
      # master._program._child_program._child_program._child_program.halt()

      # print("\n= PAUSING\n")
      # master._program.pause()
      # # master._program._child_program._child_program.pause()
      # # master._program._child_program._child_program._child_program.pause()
      # await asyncio.sleep(1)
      # print("\n= PAUSED\n")
      # master._program._child_program._child_program._child_program.resume()

      # print("= PAUSED")
      # await asyncio.sleep(0.5)
      # print("= RESUMED")
      # master._program._child_program.resume()
      # master._program.pause()

      # claim = host.root_node.find(('Mock', 'valueBool')).force_claim(ClaimSymbol())
      # await asyncio.sleep(2)
      # claim.release()
      # host.root_node.transfer_claims()

      # node = host.root_node.nodes['Mock'].nodes['valueBool']
      # await asyncio.sleep(2)
      # claim = node.claim_now(force=True)
      # await asyncio.sleep(2)
      # claim.release()

      # print("[Pausing]")
      # await asyncio.sleep(0.5)
      # master.halt()
      # master.pause()
      # await asyncio.sleep(1)
      # print("[Resuming]")
      # master.resume()
      pass


    # print()
    print("--------")
    print()

    # await asyncio.gather(a(), b())
    await a()



asyncio.run(main())

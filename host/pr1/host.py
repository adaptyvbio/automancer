from collections import namedtuple
from pathlib import Path
import asyncio
import logging
import platform
import sys
import time
import uuid

from . import logger, reader
from .chip import Chip
from .master import Master
# from .protocol import Protocol
from .unit import UnitManager
from .util import schema as sc


Draft = namedtuple("Draft", ['id', 'errors', 'protocol', 'source'])
DraftError = namedtuple("DraftError", ['message', 'range'])

class Host:
  def __init__(self, backend, update_callback):
    self.backend = backend
    self.data_dir = backend.data_dir
    self.update_callback = update_callback

    self.chips = dict()
    self.chips_dir = self.data_dir / "chips"
    self.chips_dir.mkdir(exist_ok=True)

    # os.chmod(self.data_dir, 0o775)


    # -- Load configuration -------------------------------

    conf_schema = sc.Schema({
      'id': str,
      'name': str,
      'units': sc.SimpleDict(str, {
        'development': sc.Optional(sc.ParseType(bool)),
        'enabled': sc.Optional(sc.ParseType(bool)),
        'module': sc.Optional(str),
        'path': sc.Optional(str)
      }),
      'version': sc.ParseType(int)
    })

    conf_path = self.data_dir / "setup.yml"

    if conf_path.exists():
      try:
        conf = reader.loads((self.data_dir / "setup.yml").open().read())
        conf = conf_schema.transform(conf)
      except reader.LocatedError as e:
        e.display()
        sys.exit(1)
    else:
      conf = {
        'id': hex(uuid.getnode())[2:],
        'name': platform.node(),
        'units': dict(),
        'version': 1
      }

      conf_path.open("w").write(reader.dumps(conf))

    self.id = conf['id']
    self.name = conf['name']
    self.start_time = round(time.time() * 1000)


    # -- Load units ---------------------------------------

    manager = UnitManager(conf['units'])

    logger.info(f"Loaded {len(manager.units)} units")

    # conf_units = conf['units'] or dict()

    # self.executors = {
    #   namespace: unit.Executor(conf_units.get(namespace, dict()), host=self) for namespace, unit in self.units.items() if hasattr(unit, 'Executor')
    # }

  async def initialize(self):
    logger.info("Initializing host")
    logger.debug("Initializing executors")

    for executor in self.executors.values():
      await executor.initialize()

    logger.debug("Initialized executors")

    for path in self.chips_dir.iterdir():
      if not path.name.startswith("."):
        chip = Chip.unserialize(path, units=self.units)

        for matrix in chip.matrices.values():
          matrix.initialize(chip=chip, host=self)

        chip.runners = dict()

        for namespace, unit in self.units.items():
          if hasattr(unit, 'Runner'):
            chip.runners[namespace] = unit.Runner(chip=chip, host=self)

        self.chips[chip.id] = chip

    # if len(self.chips) < 1:
    #   # debug
    #   chip = self.create_chip(name="Default chip")
    #   print(f"Created '{chip.id}'")

  async def start(self):
    try:
      await asyncio.Future()
    except asyncio.CancelledError:
      await self.destroy()

  async def destroy(self):
    logger.info("Destroying host")
    logger.debug("Destroying executors")

    for executor in self.executors.values():
      await executor.destroy()

    logger.debug("Destroyed executors")


  def _debug(self):
    # -- Debug --------------------------------------------

    chip = self.create_chip(name="Default chip")
    # _chip = self.create_chip(model_id=list(self.models.keys())[1], name="Other chip")
    draft = self.create_draft(str(uuid.uuid4()), (Path(__file__).parent.parent.parent / "test.yml").open().read())

    codes = {
      'control': {
        'arguments': [None, 0, None, 1]
      }
    }

    return chip, codes, draft

    # self.start_plan(chip, codes, draft, update_callback=update_callback)

    # try:
    #   protocol = Protocol(
    #     (Path(__file__).parent.parent / "test.yml").open().read(),
    #     parsers={ namespace: unit.Parser for namespace, unit in self.units.items() },
    #     models=self.models
    #   )

    #   pprint(protocol.export())
    # except reader.LocatedError as e:
    #   e.display()
    #   # raise e


  def compile_draft(self, draft_id, source):
    errors = list()
    protocol = None

    try:
      protocol = Protocol(
        source,
        host=self,
        parsers={ namespace: unit.Parser for namespace, unit in self.units.items() }
      )
    except reader.LocatedError as e:
      errors.append(DraftError(message=e.args[0], range=(e.location.start, e.location.end)))
    except Exception as e: # TODO: filter between unexpected errors and compilation errors
      errors.append(DraftError(message=str(e), range=None))

      import traceback
      tb = traceback.format_exc()
      print(tb)

    draft = Draft(
      id=draft_id,
      errors=errors,
      protocol=protocol,
      source=source
    )

    return draft

  def create_chip(self, name):
    chip = Chip.create(
      chips_dir=self.chips_dir,
      name=name,
      host=self
    )

    chip.runners = dict()

    for namespace, unit in self.units.items():
      if hasattr(unit, 'Runner'):
        chip.runners[namespace] = unit.Runner(chip=chip, host=self)

    self.chips[chip.id] = chip
    return chip

  def start_plan(self, chip, codes, location, protocol):
    if chip.master:
      raise Exception("Already running")

    def done_callback():
      chip.master = None
      self.update_callback()

    chip.master = Master(
      chip=chip,
      codes=codes,
      location=location,
      protocol=protocol,
      done_callback=done_callback,
      update_callback=self.update_callback
    )

    chip.master.start()


    async def a():
      # await asyncio.sleep(1.5)
      # chip.master.pause()
      # await asyncio.sleep(1)
      await asyncio.sleep(5)
      chip.master.resume()

    loop = asyncio.get_event_loop()
    # loop.create_task(a())

    # import asyncio
    # asyncio.run(chip.master.wait())


  def get_state(self):
    return {
      "info": {
        "id": self.id,
        "name": self.name,
        "startTime": self.start_time
      },
      "chips": {
        chip.id: chip.export() for chip in self.chips.values()
      },
      "devices": {
        device.id: device.export() for executor in self.executors.values() for device in executor.get_devices()
      },
      "executors": {
        namespace: executor.export() for namespace, executor in self.executors.items()
      }
    }

  async def process_request(self, request):
    if request["type"] == "compileDraft":
      draft = self.compile_draft(draft_id=request["draftId"], source=request["source"])

      return {
        "errors": [{
          "message": error.message,
          "range": error.range
        } for error in draft.errors],
        "protocol": draft.protocol and draft.protocol.export()
      }

    if request["type"] == "command":
      chip = self.chips[request["chipId"]]
      namespace, command = next(iter(request["command"].items()))
      chip.runners[namespace].command(command)

    if request["type"] == "createChip":
      chip = self.create_chip(name="Untitled chip")
      self.update_callback()

      return {
        "chipId": chip.id
      }

    if request["type"] == "deleteChip":
      # TODO: checks
      del self.chips[request["chipId"]]

    if request["type"] == "createDraftSample":
      return "# Example protocol\nname: My protocol\n\nstages:\n  - steps:\n      - name: Step no. 1\n        duration: 5 min"

    if request["type"] == "pause":
      chip = self.chips[request["chipId"]]
      chip.master.pause({
        'neutral': request["options"]["neutral"]
      })

    if request["type"] == "resume":
      chip = self.chips[request["chipId"]]
      chip.master.resume()

    if request["type"] == "setChipMetadata":
      chip = self.chips[request["chipId"]]
      chip.metadata.update(request["value"])

    if request["type"] == "setLocation":
      chip = self.chips[request["chipId"]]
      chip.master.set_location(chip.master.import_location(request["location"]))

    if request["type"] == "setMatrix":
      chip = self.chips[request["chipId"]]

      for namespace, matrix_data in request["update"].items():
        chip.matrices[namespace].update(matrix_data)

      chip.update_runners()

    if request["type"] == "skipSegment":
      chip = self.chips[request["chipId"]]
      chip.master.skip_segment(
        process_state=request["processState"],
        segment_index=request["segmentIndex"]
      )

    if request["type"] == "startPlan":
      chip = self.chips[request["chipId"]]

      protocol = Protocol(
        request["source"],
        host=self,
        parsers={ namespace: unit.Parser for namespace, unit in self.units.items() }
      )

      location = {
        'state': None, # request["location"]["state"]
        'segment_index': request["location"]["segmentIndex"]
      }

      self.start_plan(chip=chip, codes=request["data"], location=location, protocol=protocol)

    self.update_callback()

    return None

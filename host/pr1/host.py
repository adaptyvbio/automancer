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
from .protocol import Protocol
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

    self.previous_state = {
      "info": None
    }


    # -- Load configuration -------------------------------

    conf_schema = sc.Schema({
      'id': str,
      'name': str,
      'units': sc.SimpleDict(str, {
        'development': sc.Optional(sc.ParseType(bool)),
        'enabled': sc.Optional(sc.ParseType(bool)),
        'module': sc.Optional(str),
        'options': sc.Optional(dict),
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

    self.manager = UnitManager(conf['units'])

    logger.info(f"Loaded {len(self.manager.units)} units")

    self.executors = {
      name: unit.Executor(self.manager.units_info[name].options, host=self) for name, unit in self.manager.units.items() if hasattr(unit, 'Executor')
    }


  @property
  def units(self):
    return self.manager.units

  async def initialize(self):
    logger.info("Initializing host")
    logger.debug("Initializing executors")

    for executor in self.executors.values():
      await executor.initialize()

    logger.debug("Initialized executors")

    for path in self.chips_dir.iterdir():
      if not path.name.startswith("."):
        try:
          chip = Chip.unserialize(path, host=self)
        except Exception as e:
          print(e)
          logger.warn(f"Chip '{path.name}' is corrupted and will be ignored.")
        else:
          if (not chip.archived) and chip.supported:
            chip.ensure_runners(host=self)

          self.chips[chip.id] = chip

    logger.debug(f"Loaded {len(self.chips)} existing chips")
    logger.debug(f"  including {sum(chip.archived for chip in self.chips.values())} archived chips")
    logger.debug(f"  including {sum(not chip.supported for chip in self.chips.values())} unsupported chips")

    # debug
    if len(self.chips) < 1:
      self.create_chip(name="Default chip")

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
        parsers={ namespace: unit.Parser for namespace, unit in self.units.items() if hasattr(unit, 'Parser') }
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

    chip.ensure_runners(host=self)
    self.chips[chip.id] = chip

    logger.info(f"Created chip '{chip.id}'")

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
        "startTime": self.start_time,
        "units": {
          unit_info.name: {
            "development": unit_info.development,
            "enabled": unit_info.enabled,
            "name": unit_info.name,
            "version": unit_info.version
          } for unit_info in self.manager.units_info.values()
        }
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

  def get_state_update(self):
    state = self.get_state()
    state_update = dict()

    if state["info"] != self.previous_state["info"]:
      state_update.update({ "info": state["info"] })

    state_update.update({
      "chips": state["chips"],
      "devices": state["devices"],
      "executors": state["executors"]
    })

    self.previous_state = state
    return state_update

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
      chip.update_matrices(request["update"])

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

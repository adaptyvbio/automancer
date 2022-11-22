from graphlib import TopologicalSorter
import asyncio
import platform
import shutil
import sys
import time
import uuid

from . import logger, reader
from .chip import Chip, ChipCondition
from .devices.node import CollectionNode, DeviceNode
from .draft import Draft
from .fiber.parser import FiberParser
from .fiber.master2 import Master
from .protocol import Protocol
from .unit import UnitManager
from .util import schema as sc


class HostRootNode(CollectionNode):
  def __init__(self, devices):
    super().__init__()

    self.connected = True
    self.id = 'root'
    self.label = "Root"
    self.nodes = devices


class Host:
  def __init__(self, backend, update_callback):
    self.backend = backend
    self.data_dir = backend.data_dir
    self.update_callback = update_callback

    self.chips = dict()
    self.chips_dir = self.data_dir / "chips"
    self.chips_dir.mkdir(exist_ok=True)

    self.devices: dict[str, DeviceNode] = dict()
    self.root_node = HostRootNode(self.devices)

    self.previous_state = {
      "info": None
    }


    # -- Load configuration -------------------------------

    conf_schema = sc.Schema({
      'id': str,
      'name': str,
      'units': sc.Noneable(sc.SimpleDict(str, {
        'development': sc.Optional(sc.ParseType(bool)),
        'enabled': sc.Optional(sc.ParseType(bool)),
        'module': sc.Optional(str),
        'options': sc.Optional(dict),
        'path': sc.Optional(str)
      })),
      'version': sc.ParseType(int)
    })

    conf_path = self.data_dir / "setup.yml"

    if conf_path.exists():
      try:
        conf = reader.parse((self.data_dir / "setup.yml").open().read())
        conf = conf_schema.transform(conf)
      except reader.LocatedError as e:
        e.display()
        sys.exit(1)
    else:
      conf = {
        'id': hex(uuid.getnode())[2:],
        'name': platform.node(),
        'units': None,
        'version': 1
      }

      conf_path.open("w").write(reader.dumps(conf))

    self.id = conf['id']
    self.name = conf['name']
    self.start_time = round(time.time() * 1000)


    # -- Load units ---------------------------------------

    self.manager = UnitManager(conf['units'] or dict())

    logger.info(f"Loaded {len(self.manager.units)} units")

    self.executors = {
      name: unit.Executor(self.manager.units_info[name].options, host=self) for name, unit in self.manager.units.items() if hasattr(unit, 'Executor')
    }


  @property
  def ordered_namespaces(self):
    graph = {
      namespace: unit.Runner.dependencies for namespace, unit in self.units.items() if hasattr(unit, 'Runner')
    }

    return list(TopologicalSorter(graph).static_order())

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
        chip = Chip.try_unserialize(path, host=self)
        self.chips[chip.id] = chip

    keywords = ["okay", "partial", "unrunnable", "unsupported", "corrupted"]
    counts = [sum(chip.condition == condition for chip in self.chips.values()) for condition in ChipCondition]

    logger.debug(f"Loaded {len(self.chips)} existing chips")

    for keyword, count in zip(keywords, counts):
      if count > 0:
        logger.debug(f"  including {count} {keyword} chip{'s' if count > 1 else str()}")

    # debug
    # if not any(chip.condition == ChipCondition.Ok for chip in self.chips.values()):
      # self.create_chip(name="Default experiment")

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


  def compile_draft(self, draft_id: str, source: str):
    from .fiber.parsers.activate import AcmeParser
    from .fiber.parsers.condition import ConditionParser
    from .fiber.parsers.do import DoParser
    from .fiber.parsers.repeat import RepeatParser
    from .fiber.parsers.score import ScoreParser
    from .fiber.parsers.sequence import SequenceParser
    from .fiber.parsers.shorthands import ShorthandsParser

    parser = FiberParser(
      source,
      host=self,
      # Parsers=[SequenceParser, RepeatParser, ShorthandsParser, AcmeParser, ScoreParser]
      Parsers=[DoParser, SequenceParser, ShorthandsParser, AcmeParser, ScoreParser]
      # Parsers=[DoParser, RepeatParser, SequenceParser, ShorthandsParser, AcmeParser, ScoreParser]
      # parsers={ namespace: unit.Parser for namespace, unit in self.units.items() if hasattr(unit, 'Parser') }
    )

    return Draft(
      id=draft_id,
      analysis=parser.analysis,
      protocol=parser.protocol
    )

  def create_chip(self):
    chip = Chip.create(
      chips_dir=self.chips_dir,
      host=self
    )

    self.chips[chip.id] = chip
    logger.info(f"Created chip '{chip.id}'")

    return chip

  async def reload_units(self):
    logger.info("Reloading development units")

    self.manager.reload()

    for unit_info in self.manager.units_info.values():
      namespace = unit_info.namespace

      if unit_info.enabled and unit_info.development:
        if namespace in self.executors:
          await self.executors[namespace].destroy()
          del self.executors[namespace]

        if hasattr(unit_info.unit, 'Executor'):
          self.executors[namespace] = unit_info.unit.Executor(unit_info.options, host=self)
          await self.executors[namespace].initialize()

        for chip in set(self.chips.values()):
          self.chips[chip.id] = Chip.try_unserialize(chip.dir, host=self)

        # for chip in self.chips.values():
        #   old_runner = chip.runners.get(namespace)

        #   if old_runner:
        #     del chip.runners[namespace]

        #   if hasattr(unit_info.unit, 'Runner'):
        #     runner = unit_info.unit.Runner(chip=chip, host=self)

        #     if old_runner:
        #       runner.unserialize(old_runner.serialize())
        #     else:
        #       runner.create()

        #     chip.runners[namespace] = runner

        #   # <- Save chip

  def get_state(self):
    return {
      "info": {
        "id": self.id,
        "instanceRevision": self.manager.revision,
        "name": self.name,
        "startTime": self.start_time,
        "units": {
          unit_info.namespace: {
            "development": unit_info.development,
            "enabled": unit_info.enabled,
            "hasClient": hasattr(unit_info.unit, 'client_path'),
            "metadata": {
              "author": unit_info.metadata.author,
              "description": unit_info.metadata.description,
              "icon": {
                "kind": unit_info.metadata.icon.kind,
                "value": unit_info.metadata.icon.value
              } if unit_info.metadata.icon else None,
              "license": unit_info.metadata.license,
              "title": unit_info.metadata.title,
              "url": unit_info.metadata.url,
              "version": unit_info.metadata.version
            },
            "namespace": unit_info.namespace,
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

  async def process_request(self, request, *, client):
    if request["type"] == "compileDraft":
      try:
        draft = self.compile_draft(draft_id=request["draftId"], source=request["source"])
      except:
        import traceback
        traceback.print_exc()

        from .fiber import langservice as lang
        draft = Draft(analysis=lang.Analysis(), id=request["draftId"], protocol=None)

      return draft.export()

    if request["type"] == "command":
      chip = self.chips[request["chipId"]]
      await chip.runners[request["namespace"]].command(request["command"])

    if request["type"] == "createChip":
      chip = self.create_chip()
      self.update_callback()

      return {
        "chipId": chip.id
      }

    if request["type"] == "createDraftSample":
      return "# Example protocol\nname: My protocol\n\nstages:\n  - steps:\n      - name: Step no. 1\n        duration: 5 min"

    if request["type"] == "instruct":
      namespace, instruction = next(iter(request["instruction"].items()))
      await self.executors[namespace].instruct(instruction)

    if request["type"] == "pause":
      chip = self.chips[request["chipId"]]
      chip.master.pause({
        'neutral': request["options"]["neutral"]
      })

    if request["type"] == "reloadUnits":
      await self.reload_units()

    if request["type"] == "resume":
      chip = self.chips[request["chipId"]]
      chip.master.resume()

    if request["type"] == "setLocation":
      chip = self.chips[request["chipId"]]
      chip.master.set_location(chip.master.import_location(request["location"]))

    if request["type"] == "skipSegment":
      chip = self.chips[request["chipId"]]
      chip.master.skip_segment(
        process_state=request["processState"],
        segment_index=request["segmentIndex"]
      )

    if request["type"] == "startDraft":
      chip = self.chips[request["chipId"]]

      if chip.master:
        raise Exception("Already running")

      draft = self.compile_draft(draft_id=request["draftId"], source=request["source"])
      assert draft.protocol

      def done_callback():
        chip.master = None

      def update_callback():
        self.update_callback()

      chip.master = Master(draft.protocol, chip)
      await chip.master.start(done_callback, update_callback)

    match request["type"]:
      case "deleteChip":
        chip = self.chips[request["chipId"]]

        # TODO: checks

        if request["trash"]:
          self.backend.trash(chip.dir)
        else:
          shutil.rmtree(chip.dir)

        del self.chips[request["chipId"]]

      case "duplicateChip":
        chip = self.chips[request["chipId"]]
        duplicated = chip.duplicate(chips_dir=self.chips_dir, host=self, template=request["template"])

        self.chips[duplicated.id] = duplicated
        logger.info(f"Duplicated chip '{chip.id}' into '{duplicated.id}'")

        self.update_callback()
        return { "chipId": duplicated.id }

      case "revealChipDirectory":
        if client.remote:
          return

        chip = self.chips[request["chipId"]]
        self.backend.reveal(chip.dir)

      case "upgradeChip":
        chip = self.chips[request["chipId"]]
        chip.upgrade(host=self)

        logger.info(f"Upgraded chip '{chip.id}'")

    match request["type"]:
      case "deleteChip":
        chip = self.chips[request["chipId"]]

        # TODO: checks

        if request["trash"]:
          self.backend.trash(chip.dir)
        else:
          shutil.rmtree(chip.dir)

        del self.chips[request["chipId"]]

      case "duplicateChip":
        chip = self.chips[request["chipId"]]
        duplicated = chip.duplicate(chips_dir=self.chips_dir, host=self, template=request["template"])

        self.chips[duplicated.id] = duplicated
        logger.info(f"Duplicated chip '{chip.id}' into '{duplicated.id}'")

        self.update_callback()
        return { "chipId": duplicated.id }

      case "revealChipDirectory":
        if client.remote:
          return

        chip = self.chips[request["chipId"]]
        self.backend.reveal(chip.dir)

      case "upgradeChip":
        chip = self.chips[request["chipId"]]
        chip.upgrade(host=self)

        logger.info(f"Upgraded chip '{chip.id}'")

    self.update_callback()

    return None

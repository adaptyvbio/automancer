import asyncio
import platform
import shutil
import sys
import time
import uuid
from graphlib import TopologicalSorter
from types import EllipsisType
from typing import Any, Optional, Protocol, cast

from .util.misc import BaseDataInstance, create_datainstance

from .langservice import LanguageServiceAnalysis
from .analysis import DiagnosticAnalysis
from . import logger, reader
from .chip import Chip, ChipCondition
from .devices.nodes.collection import CollectionNode, DeviceNode
from .devices.nodes.common import BaseNode, NodeId, NodePath
from .document import Document
from .draft import Draft, DraftCompilation
from .input import (Attribute, BoolType, KVDictType,
                                PrimitiveType, RecordType, StrType)
from .fiber.master2 import Master
from .fiber.parser import AnalysisContext
from .unit import UnitManager
from .ureg import ureg
from .util.pool import Pool


class HostRootNode(CollectionNode):
  def __init__(self, devices: dict[NodeId, BaseNode]):
    super().__init__()

    self.connected = True
    self.description = None
    self.id = NodeId('root')
    self.label = "Root"
    self.nodes = devices

  def iter_all(self):
    for child_node in self.nodes.values():
      yield from child_node.iter_all()

  def find(self, path: NodePath) -> Optional[BaseNode]:
    node = self

    for node_id in path:
      if not isinstance(node, CollectionNode):
        return None

      node = node.nodes.get(node_id)

      if not node:
        return None

    return node


class Host:
  def __init__(self, backend, update_callback):
    self.backend = backend
    self.data_dir = backend.data_dir
    self.update_callback = update_callback

    self.chips = dict[str, Chip]()
    self.chips_dir = self.data_dir / "chips"
    self.chips_dir.mkdir(exist_ok=True)

    self.devices = dict[str, DeviceNode]()
    self.pool: Pool
    self.root_node = HostRootNode(self.devices)

    self.previous_state = {
      "info": None
    }


    # -- Load configuration -------------------------------

    class PluginConf(Protocol):
      development: str
      enabled: bool
      module: Optional[str]
      options: Optional[dict[str, Any]]
      path: Optional[str]

    class HostConf(Protocol):
      id: str
      name: str
      units: dict[str, PluginConf]

    conf_type = RecordType({
      'id': StrType(),
      'name': StrType(),
      'units': KVDictType(
        StrType(),
        RecordType({
          'development': Attribute(BoolType(), default=False),
          'enabled': Attribute(BoolType(), default=True),
          'module': Attribute(StrType(), default=None),
          'options': Attribute(PrimitiveType(dict), default=None),
          'path': Attribute(StrType(), default=None)
        })
      ),
      'version': PrimitiveType(int)
    })

    conf_path = (self.data_dir / "setup.yml")

    if conf_path.exists():
      document = Document.text((self.data_dir / "setup.yml").open().read())

      analysis, conf_data = reader.loads2(document.source)
      raw_conf: Any = analysis.add(conf_type.analyze(conf_data, AnalysisContext()))

      analysis.log_diagnostics(logger)

      if isinstance(raw_conf, EllipsisType) or analysis.errors:
        sys.exit(1)

      conf: HostConf = cast(reader.LocatedValue, raw_conf).dislocate()

      units_conf = {
        namespace: create_datainstance({
          **conf.units[namespace]._asdict(),
          'options': raw_unit_conf.value.options
        }) for namespace, raw_unit_conf in (raw_conf.value.units or dict()).items()
      }
    else:
      conf: HostConf = create_datainstance({
        'id': hex(uuid.getnode())[2:],
        'name': platform.node(),
        'units': {},
        'version': 1
      })

      units_conf = dict()
      conf_path.open("w").write(reader.dumps(conf))

    self.id = conf.id
    self.name = conf.name
    self.start_time = round(time.time() * 1000)


    # -- Load units ---------------------------------------

    self.executors = dict()
    self.manager = UnitManager(units_conf)

    logger.info(f"Loaded {len(self.manager.units)} units")

    self.ureg = ureg

    analysis = DiagnosticAnalysis()

    for namespace in self.manager.units.keys():
      unit_analysis, executor = self.manager.create_executor(namespace, host=self)
      analysis += unit_analysis

      if executor and not isinstance(executor, EllipsisType):
        self.executors[namespace] = executor

    analysis.log_diagnostics(logger)


  @property
  def ordered_namespaces(self):
    graph = {
      namespace: unit.Runner.dependencies for namespace, unit in self.units.items() if hasattr(unit, 'Runner')
    }

    return list(TopologicalSorter(graph).static_order())

  @property
  def units(self):
    return self.manager.units

  async def start(self):
    logger.info("Initializing host")

    async with Pool.open("Host pool") as pool:
      self.pool = pool

      logger.debug("Initializing executors")

      for executor in self.executors.values():
        await pool.wait_until_ready(executor.start())

      logger.debug("Initialized executors")
      yield


      # Node tree information

      logger.info("Node tree")

      for line in self.root_node.format_hierarchy().splitlines():
        logger.debug(line)

      for path in self.chips_dir.iterdir():
        if not path.name.startswith("."):
          chip = Chip.try_unserialize(path, host=self)

          if isinstance(chip, Chip):
            self.chips[chip.id] = chip

      logger.debug(f"Loaded {len(self.chips)} chips")

  def busy(self):
    return any(chip.master for chip in self.chips.values())

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

    analysis = DiagnosticAnalysis()

    for unit_info in self.manager.units_info.values():
      namespace = unit_info.namespace

      if unit_info.enabled and unit_info.development:
        if namespace in self.executors:
          await self.executors[namespace].destroy()
          del self.executors[namespace]

        unit_analysis, executor = self.manager.create_executor(namespace, host=self)
        analysis += unit_analysis

        if executor and not isinstance(executor, EllipsisType):
          self.executors[namespace] = executor
          await executor.initialize()

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

    analysis.log_diagnostics(logger)

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
      "executors": state["executors"]
    })

    self.previous_state = state
    return state_update

  async def process_request(self, request, *, agent) -> Any:
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

    if request["type"] == "reloadUnits":
      await self.reload_units()

    match request["type"]:
      case "compileDraft":
        draft = Draft.load(request["draft"])

        try:
          compilation = draft.compile(host=self)
        except:
          import traceback
          traceback.print_exc()

          compilation = DraftCompilation(
            analysis=LanguageServiceAnalysis(),
            document_paths={draft.entry_document.path},
            draft_id=draft.id,
            protocol=None
          )

        return compilation.export()

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

      case "requestExecutor":
        return await self.executors[request["namespace"]].request(request["data"], agent=agent)

      case "revealChipDirectory":
        if agent.client.remote:
          return

        chip = self.chips[request["chipId"]]
        self.backend.reveal(chip.dir)

      case "sendMessageToActiveBlock":
        chip = self.chips[request["chipId"]]
        assert chip.master

        chip.master.receive(request["path"], request["message"])

        return None

      case "startDraft":
        chip = self.chips[request["chipId"]]

        if chip.master:
          raise Exception("Already running")

        draft = Draft.load(request["draft"])
        compilation = draft.compile(host=self)

        def cleanup_callback():
          chip.master = None

        def update_callback():
          self.update_callback()

        logger.info(f"Running protocol on chip '{chip.id}'")

        async def func():
          assert compilation.protocol

          chip.master = Master(compilation.protocol, chip, cleanup_callback=cleanup_callback, host=self)
          run_task = asyncio.create_task(chip.master.run(update_callback))

          try:
            await asyncio.shield(run_task)
          except asyncio.CancelledError:
            logger.info(f"Halting protocol on chip '{chip.id}'")
            chip.master.halt()

            await run_task

          logger.info(f"Ran protocol on chip '{chip.id}'")
          self.update_callback()

        self.pool.start_soon(func(), priority=10)

      case "upgradeChip":
        chip = self.chips[request["chipId"]]
        chip.upgrade(host=self)

        logger.info(f"Upgraded chip '{chip.id}'")

    self.update_callback()

    return None

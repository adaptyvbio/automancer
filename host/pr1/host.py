import asyncio
import platform
import shutil
import sys
import time
import uuid
from types import EllipsisType, NoneType
from typing import Any, Optional, Protocol, cast

from . import logger, reader
from .analysis import DiagnosticAnalysis
from .devices.nodes.collection import CollectionNode
from .devices.nodes.common import BaseNode, NodeId, NodePath
from .document import Document
from .draft import Draft, DraftCompilation
from .experiment import Experiment, ExperimentId
from .fiber.master2 import Master
from .fiber.parser import AnalysisContext, GlobalContext
from .input import (Attribute, BoolType, KVDictType, PrimitiveType, RecordType,
                    StrType, UnionType)
from .langservice import LanguageServiceAnalysis
from .plugin.manager import PluginManager
from .util.misc import create_datainstance
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

  # def find_unchecked(self, path: NodePath) -> BaseNode:
  #   node = self.find(path)

  #   if not node:
  #     raise ValueError(f"Node with path {path!r} not found")

  #   return node


class PluginConf(Protocol):
  development: bool
  enabled: bool
  module: Optional[str]
  options: reader.LocatedValue[dict[str, Any]]
  path: Optional[str]

class HostConf(Protocol):
  id: str
  name: str
  plugin: dict[str, PluginConf]


class Host:
  def __init__(self, backend, update_callback):
    self.backend = backend
    self.data_dir = backend.data_dir
    self.update_callback = update_callback

    self.experiments = dict[str, Experiment]()
    self.experiments_path = self.data_dir / "experiments"
    self.experiments_path.mkdir(exist_ok=True)

    self.devices = dict[NodeId, BaseNode]()
    self.pool: Pool
    self.root_node = HostRootNode(self.devices)

    self.previous_state = {
      "info": None
    }


    # -- Load configuration -------------------------------

    conf_type = RecordType({
      'id': StrType(),
      'name': StrType(),
      'plugins': UnionType(
        PrimitiveType(NoneType),
        KVDictType(
          StrType(),
          RecordType({
            'development': Attribute(BoolType(), default=False),
            'enabled': Attribute(BoolType(), default=True),
            'options': Attribute(PrimitiveType(dict), default={})
          })
        )
      ),
      'version': PrimitiveType(int)
    })

    conf_path = (self.data_dir / "setup.yml")

    if not conf_path.exists():
      with conf_path.open("w") as file:
        file.write(reader.dumps({
          'id': hex(uuid.getnode())[2:],
          'name': platform.node(),
          'plugins': {},
          'version': 1
        }))

    with (self.data_dir / "setup.yml").open() as file:
      document = Document.text(file.read())

    analysis = LanguageServiceAnalysis()
    conf_data = analysis.add(reader.loads2(document.source))
    raw_conf = analysis.add(conf_type.analyze(conf_data, AnalysisContext()))

    analysis.log_diagnostics(logger)

    if isinstance(raw_conf, EllipsisType) or analysis.errors:
      sys.exit(1)

    conf: HostConf = cast(reader.LocatedValue, raw_conf).dislocate()

    plugins_conf = {
      namespace.value: create_datainstance({
        **conf.plugins[namespace]._asdict(), # type: ignore
        'options': raw_plugin_conf.value.options
      }) for namespace, raw_plugin_conf in (raw_conf.value.plugins.value or dict()).items()
    }

    self.id = conf.id
    self.name = conf.name
    self.start_time = round(time.time() * 1000)


    # -- Load units ---------------------------------------

    self.executors = dict()
    self.manager = PluginManager(reader.LocatedValue(plugins_conf, raw_conf.area))

    logger.info(f"Loaded {len(self.manager.plugins)} plugins")

    analysis = DiagnosticAnalysis()

    for namespace in self.manager.plugins.keys():
      executor = analysis.add_downcast(self.manager.create_executor(namespace, host=self))

      if not isinstance(executor, EllipsisType):
        self.executors[namespace] = executor

    analysis.log_diagnostics(logger)

  @property
  def plugins(self):
    return self.manager.plugins

  async def start(self):
    logger.info("Initializing host")

    async with Pool.open("Host pool") as self.pool:
      logger.debug("Initializing executors")

      for executor in self.executors.values():
        await self.pool.wait_until_ready(executor.start())

      logger.debug("Initialized executors")
      yield


      # Node tree information

      logger.info("Node tree")

      for line in self.root_node.format_hierarchy().splitlines():
        logger.debug(line)

      for path in self.experiments_path.iterdir():
        if not path.name.startswith("."):
          if (experiment := Experiment.try_unserialize(path)):
            self.experiments[experiment.id] = experiment

      logger.debug(f"Loaded {len(self.experiments)} experiments")

  def busy(self):
    return any(chip.master for chip in self.experiments.values())

  async def reload_units(self):
    logger.info("Reloading development units")

    self.manager.reload()

    analysis = DiagnosticAnalysis()

    for unit_info in self.manager.plugin_infos.values():
      namespace = unit_info.namespace

      if unit_info.enabled and unit_info.development:
        if namespace in self.executors:
          await self.executors[namespace].destroy()
          del self.executors[namespace]

        unit_analysis, executor = self.manager.create_executor(namespace, host=self)
        analysis += unit_analysis

        if not isinstance(executor, EllipsisType):
          self.executors[namespace] = executor
          await executor.initialize()

    analysis.log_diagnostics(logger)

  def get_state(self):
    return {
      "info": {
        "id": self.id,
        "instanceRevision": self.manager.revision,
        "name": self.name,
        "startTime": self.start_time,
        "units": {
          plugin_info.namespace: {
            "development": plugin_info.development,
            "enabled": plugin_info.enabled,
            "hasClient": hasattr(plugin_info.plugin, 'client_path'),
            "metadata": {
              "author": plugin_info.metadata.author,
              "description": plugin_info.metadata.description,
              "icon": {
                "kind": plugin_info.metadata.icon.kind,
                "value": plugin_info.metadata.icon.value
              } if plugin_info.metadata.icon else None,
              "license": plugin_info.metadata.license,
              "title": plugin_info.metadata.title,
              "url": plugin_info.metadata.url,
              "version": plugin_info.metadata.version
            },
            "namespace": plugin_info.namespace,
            "version": plugin_info.version
          } for plugin_info in self.manager.plugin_infos.values()
        }
      },
      "experiments": {
        experiment.id: experiment.export() for experiment in self.experiments.values()
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
      "experiments": state["experiments"],
      "executors": state["executors"]
    })

    self.previous_state = state
    return state_update

  async def process_request(self, request, *, agent) -> Any:
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

        if compilation.protocol and (experiment_id := request["studyExperimentId"]):
          experiment = self.experiments[experiment_id]
          assert experiment.master

          study = experiment.master.study_block(compilation.protocol.root)
        else:
          study = None

        return {
          **compilation.export(GlobalContext(self)),
          "study": study and {
            "mark": study[1].export(),
            "point": study[0].export()
          }
        }

      case "createExperiment":
        experiment_id = ExperimentId(str(uuid.uuid4()))
        experiment = Experiment(
          id=experiment_id,
          path=(self.experiments_path / experiment_id),
          title=request["title"]
        )

        experiment.save()
        self.experiments[experiment_id] = experiment

        return {
          "experimentId": experiment.id
        }

      case "deleteExperiment":
        experiment = self.experiments[request["experimentId"]]

        # TODO: checks

        if request["trash"]:
          self.backend.trash(experiment.path)
        else:
          shutil.rmtree(experiment.path)

        del self.experiments[request["experimentId"]]

      case "getExperimentReportInfo":
        experiment = self.experiments[request["experimentId"]]
        return experiment.report_reader.export(GlobalContext(self))

      case "getExperimentReportEvents":
        experiment = self.experiments[request["experimentId"]]
        return experiment.report_reader.export_events(GlobalContext(self), set(request["eventIndices"]))

      case "requestToExecutor":
        return await self.executors[request["namespace"]].request(request["data"], agent=agent)

      case "requestToRunner":
        experiment = self.experiments[request["experimentId"]]
        assert experiment.master

        return await experiment.master.runners[request["namespace"]].request(request["data"], agent=agent)

      case "revealExperimentDirectory":
        if not agent.client.remote:
          experiment = self.experiments[request["experimentId"]]
          self.backend.reveal(experiment.path)

      case "sendMessageToActiveBlock":
        experiment = self.experiments[request["experimentId"]]
        assert experiment.master

        experiment.master.receive(request["path"], request["message"])

        return None

      case "startDraft":
        experiment = self.experiments[request["experimentId"]]

        if experiment.master:
          raise Exception("Already running")

        draft = Draft.load(request["draft"])
        compilation = draft.compile(host=self)

        logger.info(f"Running protocol on experiment '{experiment.id}'")

        experiment.prepare()
        experiment.master = Master(compilation, experiment, host=self)

        async def func():
          assert experiment.master

          run_task = asyncio.create_task(experiment.master.run(self.update_callback))

          try:
            await asyncio.shield(run_task)
          except asyncio.CancelledError:
            logger.info(f"Halting protocol on experiment '{experiment.id}'")
            experiment.master.halt()

            await run_task
          finally:
            experiment.master = None

          logger.info(f"Ran protocol on experiment '{experiment.id}'")
          self.update_callback()

        self.pool.start_soon(func(), priority=10)

        return {
          "masterId": experiment.master.id
        }

    self.update_callback()

    return None


__all__ = [
  'Host',
  'HostRootNode'
]

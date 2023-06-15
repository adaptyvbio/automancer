import importlib
import importlib.metadata
import importlib.util
import sys
from dataclasses import dataclass
from importlib.metadata import EntryPoint
from types import EllipsisType
from typing import TYPE_CHECKING, Any, NewType, Optional, Protocol

from .. import logger
from ..analysis import DiagnosticAnalysis
from ..fiber.parser import AnalysisContext, BaseParser
from ..reader import LocatedValue
from ..units.base import BaseExecutor, BaseRunner, Metadata
from ..util.misc import create_datainstance

if TYPE_CHECKING:
  from ..host import Host, PluginConf


PluginName = NewType('PluginName', str)


class PluginProtocol(Protocol):
  Executor: type[BaseExecutor] # Optional
  Parser: type[BaseParser] # Optional
  Runner: type[BaseRunner] # Optional
  client_path: str # Optional
  metadata: Metadata # Optional
  namespace: PluginName
  version: int

@dataclass(kw_only=True, slots=True)
class PluginInfo:
  development: bool
  enabled: bool
  entry_point: EntryPoint
  options: LocatedValue[Optional[Any]]
  namespace: PluginName
  plugin: PluginProtocol

  @property
  def metadata(self):
    return self.plugin.metadata

  @property
  def version(self):
    return self.plugin.version


class PluginManager:
  def __init__(self, conf):
    self.load(conf)
    self.revision = 0

  def create_executor(self, namespace: PluginName, host: 'Host'):
    context = AnalysisContext()
    plugin_info = self.plugin_infos[namespace]

    if hasattr(plugin_info.plugin, 'Executor'):
      Executor = plugin_info.plugin.Executor

      analysis, conf = Executor.options_type.analyze(plugin_info.options, context) # type: ignore

      if isinstance(conf, EllipsisType):
        logger.error(f"Failed to load configuration of plugin '{namespace}'")
        return analysis, Ellipsis

      executor = Executor(conf, host=host)
      analysis_load = executor.load(context)

      if analysis_load:
        analysis += analysis_load

      return analysis, executor

    return DiagnosticAnalysis(), Ellipsis

  def load(self, conf: 'LocatedValue[dict[str, PluginConf]]'):
    self.plugin_infos = dict[PluginName, PluginInfo]()
    self.plugins = dict[PluginName, PluginProtocol]()

    for entry_point in [
      *importlib.metadata.entry_points(group="automancer.plugins"),
      *importlib.metadata.entry_points(group="pr1.units") # Deprecated
    ]:
      plugin: PluginProtocol = entry_point.load()
      namespace = plugin.namespace

      if namespace in self.plugin_infos:
        logger.warn(f"Duplicate plugin with name '{namespace}'")
        logger.warn("This plugin will be ignored.")
        continue

      if namespace != entry_point.name:
        logger.warn(f"Invalid plugin name '{namespace}' for entry point '{entry_point.name}'")
        logger.warn("This plugin will be ignored.")
        continue

      plugin_conf: 'PluginConf' = conf.value.get(namespace, create_datainstance(dict(
        development=True,
        enabled=True,
        options=LocatedValue({}, conf.area)
      )))

      plugin_info = PluginInfo(
        development=plugin_conf.development,
        enabled=plugin_conf.enabled,
        entry_point=entry_point,
        namespace=namespace,
        options=plugin_conf.options,
        plugin=plugin
      )

      self.plugin_infos[namespace] = plugin_info
      logger.debug(f"Registered plugin '{namespace}'")

    for plugin_info in self.plugin_infos.values():
      if plugin_info.enabled:
        self.plugins[plugin_info.namespace] = plugin_info.plugin

        if plugin_info.development:
          logger.info(f"Loaded plugin '{plugin_info.namespace}' in development mode")
        else:
          logger.debug(f"Loaded plugin '{plugin_info.namespace}'")


    self.Parsers = [plugin.Parser for plugin in self.plugins.values() if hasattr(plugin, 'Parser')]

  def reload(self):
    for plugin_info in self.plugin_infos.values():
      if plugin_info.development and plugin_info.enabled:
        reload_count = 1

        importlib.reload(sys.modules[plugin_info.entry_point.module])

        for name, module in reversed(sys.modules.copy().items()):
          if name.startswith(plugin_info.entry_point.module + "."):
            importlib.reload(module)
            reload_count += 1

        plugin_info.plugin = plugin_info.entry_point.load()
        self.plugins[plugin_info.namespace] = plugin_info.plugin

        logger.debug(f"Reloaded plugin '{plugin_info.namespace}' by reloading {reload_count} modules")

    self.revision += 1


__all__ = [
  'PluginManager',
  'PluginName',
  'PluginProtocol'
]

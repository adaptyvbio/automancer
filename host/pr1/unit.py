import importlib
import importlib.metadata
import importlib.util
import inspect
import sys

from . import logger


class UnitInfo:
  def __init__(self, *, module, path, source_name, unit):
    self.development = False
    self.enabled = True
    self.module = module
    self.options = dict()
    self.path = path
    self.source_name = source_name
    self.unit = unit

    try:
      metadata = importlib.metadata.metadata(module)
    except importlib.metadata.PackageNotFoundError:
      self.package_name = None
      self.package_version = None
    else:
      self.package_name = metadata.get('name')
      self.package_version = metadata.get('version')

  @property
  def name(self):
    return self.unit.name

  @property
  def version(self):
    return self.unit.version


class UnitManager:
  def __init__(self, conf):
    self.load(conf)

  def load(self, conf):
    units_info = list()

    for name, unit_conf in conf.items():
      if 'module' in unit_conf:
        module = unit_conf['module'].value

        if 'path' in unit_conf:
          spec = importlib.util.spec_from_file_location(module, unit_conf['path'].value)
          unit = importlib.util.module_from_spec(spec)
          sys.modules[module] = unit
          spec.loader.exec_module(unit)
        else:
          unit = importlib.import_module(module)

        units_info.append(UnitInfo(
          module=module,
          path=unit.__file__,
          source_name=name,
          unit=unit
        ))

    # TODO: use entry_points() filtering when moving to Python 3.10
    # See https://docs.python.org/3/library/importlib.metadata.html

    relevant_entry_points = list(importlib.metadata.entry_points().get("pr1.units"))

    for entry_point in relevant_entry_points:
      unit = entry_point.load()

      units_info.append(UnitInfo(
        module=entry_point.module,
        path=inspect.getfile(unit),
        source_name=entry_point.name,
        unit=unit
      ))

    self.units = dict()
    self.units_info = dict()

    for unit_info in units_info:
      name = unit_info.name

      if name in self.units:
        logger.warn(f"Duplicate unit with name '{name}'")
        logger.warn("This unit will be ignored.")
        continue

      if name != unit_info.source_name:
        logger.warn(f"Invalid name '{name}' for source with name '{unit_info.source_name}'")
        logger.warn("This unit will be ignored.")
        continue

      if name in conf:
        unit_conf = conf[name]
        unit_info.development = unit_conf.get('development', False)
        unit_info.enabled = unit_conf.get('enabled', True)
        unit_info.options = unit_conf.get('options', dict())

      self.units_info[name] = unit_info

      logger.debug(f"Registered unit '{name}' from module '{unit_info.module}'" + (f" and package '{unit_info.package_name}' with version '{unit_info.package_version}'" if unit_info.package_name else str()))

    for unit_info in self.units_info.values():
      if unit_info.enabled:
        self.units[unit_info.name] = unit_info.unit

        if unit_info.development:
          logger.info(f"Loaded unit '{unit_info.name}' in development mode")
        else:
          logger.debug(f"Loaded unit '{unit_info.name}'")

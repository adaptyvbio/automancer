import importlib
import importlib.metadata
import inspect
import logging
from collections import namedtuple
from pprint import pprint

from . import logger


UnitInfo = namedtuple("UnitInfo", ["development", "module", "name", "package_name", "package_version", "path", "unit"])

class UnitManager:
  def __init__(self, conf):
    self.load(conf)

  def load(self, conf):
    # TODO: use entry_points() filtering when moving to Python 3.10
    # See https://docs.python.org/3/library/importlib.metadata.html

    relevant_entry_points = list(importlib.metadata.entry_points().get("pr1.units"))
    units_info = list()

    for entry_point in relevant_entry_points:
      unit = entry_point.load()

      if unit.name != entry_point.name:
        logger.warn(f"Invalid name '{unit.name}' for entry point '{entry_point.name}'")
        logger.warn("This unit will be ignored.")
        continue

      metadata = importlib.metadata.metadata(entry_point.module)

      units_info.append(UnitInfo(
        development=False,
        module=entry_point.module,
        name=unit.name,
        package_name=metadata.get('name'),
        package_version=metadata.get('version'),
        path=inspect.getfile(unit),
        unit=unit
      ))

    self.units = dict()
    self.units_info = dict()

    for unit_info in units_info:
      name = unit_info.name

      if name in self.units:
        logger.warn(f"Duplicate unit name '{name}'")
        logger.warn("This unit will be ignored.")

      self.units[name] = unit_info.unit
      self.units_info[name] = unit_info

      logger.debug(f"Loaded unit '{name}' from module '{unit_info.module}' and package '{unit_info.package_name}' with version '{unit_info.package_version}'")

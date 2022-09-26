from pathlib import Path
import functools
import tempfile

from . import logger


@functools.cache
def find_trash():
  home = Path.home()

  # TODO: Add support for Windows
  locations = [
    home / ".local/share/Trash",
    home / ".Trash"
  ]

  for location in locations:
    if location.exists():
      return location

  return None


def trash(source: Path):
  trash_location = find_trash()

  if trash_location is None:
    trash_location = Path(tempfile.mkdtemp())
    logger.warning("No trash location found, using temporary directory instead")

  index = 0
  target = trash_location / source.name

  while target.exists():
    index += 1
    target = trash_location / f"{source.name} {index}"

  logger.debug(f"Moving '{source}' to '{target}'")
  source.rename(target)

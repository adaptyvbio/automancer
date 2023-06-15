import asyncio
import os
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Optional, Protocol

import automancer as am
import numpy as np

from . import logger


macros_dir = Path(__file__).parent / "macros"
macro_capture = (macros_dir / "capture.mac").open().read()
macro_inspect = (macros_dir / "inspect.mac").open().read()
macro_query = (macros_dir / "query.mac").open().read()


class Conf(Protocol):
  nis_path: str


class Executor(am.BaseExecutor):
  options_type = am.RecordType({
    'nis_path': am.Attribute(am.StrType(), default=r"C:\Program Files\NIS-Elements\nis_ar.exe")
  })

  def __init__(self, conf, *, host):
    executor_conf: Conf = conf.dislocate()

    self._host = host
    self._elements_path = executor_conf.nis_path
    self._stage_bounds: None = None

    self._last_capture_points: Optional[np.ndarray] = None
    self._objectives: Optional[list[str]] = None
    self._optconfs: Optional[list[str]] = None

  async def start(self):
    if os.name != "nt":
      raise Exception("NIS-Elements is only available on Windows")

    self._objectives, self._optconfs = await self.inspect()
    logger.debug(f"Found {len(self._objectives)} objectives and {len(self._optconfs)} optical configurations")

    yield

  def export(self):
    return {
      "objectives": self._objectives,
      "optconfs": self._optconfs
    }

  async def start_elements(self):
    CREATE_NEW_PROCESS_GROUP = 0x00000200
    DETACHED_PROCESS = 0x00000008

    await asyncio.create_subprocess_exec(self._elements_path, creationflags=(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP))
    await asyncio.sleep(5)

  async def run_elements(self, macro_path: str):
    return await asyncio.create_subprocess_exec(
      self._elements_path,
      "-mw",
      macro_path,
      stdout=asyncio.subprocess.PIPE,
      stderr=asyncio.subprocess.PIPE
    )

  async def run_macro(self, raw_source: str, **kwargs):
    source = raw_source % kwargs

    with NamedTemporaryFile(delete=False, mode="w") as file:
      file.write(source)
      file.close()

      proc = await self.run_elements(macro_path=file.name)
      _, stderr = await proc.communicate()

      if stderr:
        raise Exception(stderr.decode("utf-8"))

  async def capture(
    self,
    *,
    chip_count: int,
    exposure: float,
    objective: str,
    optconf: str,
    output_path: Path,
    points: np.ndarray,
    z_offset: float
  ):
    for chip_index in range(chip_count):
      chip_output_path = Path(str(output_path).replace("{}", str(chip_index)))
      chip_output_path.unlink(missing_ok=True)

    offset_points = points.copy()
    offset_points[:, :, 2] += z_offset

    axes = ['x', 'y', 'z']
    points_code = "\n\n".join([f"  dx[{index}] = {point[0]:.6f};\n  dy[{index}] = {point[1]:.6f};\n  dz[{index}] = {point[2]:.6f};" for index, point in enumerate(offset_points.reshape(-1, 3))])
    bounds_code = "\n".join([f"  b{axes[axis]}[{index}] = {bound};" for axis, axis_bounds in enumerate(self._stage_bounds) for index, bound in enumerate(axis_bounds)]) if self._stage_bounds else str()

    await self.run_macro(
      macro_capture,
      bounds_code=bounds_code,
      check_bounds=int(self._stage_bounds is not None),
      chip_cols=48,
      chip_rows=16,
      chip_count=chip_count,
      chip_point_count=(chip_count * 4),
      exposure=exposure,
      objective=objective,
      optconf=optconf,
      output_path=str(output_path)[:-4].replace("{}", "%i"),
      points_code=points_code,
      set_points=int((chip_count > 1) or (self._last_capture_points is None) or not np.array_equal(self._last_capture_points, points)),
    )

    self._last_capture_points = points

  async def inspect(self):
    import win32file

    file = NamedTemporaryFile(delete=False, mode="w")
    file.close()

    await self.run_macro(
      macro_inspect,
      output_path=win32file.GetLongPathName(str(file.name))
    )

    data = Path(file.name).open(mode="rb").read().decode("utf-16")
    objectives, optconfs = [line.split(";")[0:-1] for line in data.split("//")]

    return objectives, optconfs

  async def query(self, *, chip_count: int):
    import win32file

    file = NamedTemporaryFile(delete=False, mode="w")
    file.close()

    await self.run_macro(
      macro_query,
      chip_count=chip_count,
      chip_point_count=(chip_count * 4),
      output_path=win32file.GetLongPathName(str(file.name))
    )

    data = Path(file.name).open(mode="rb").read().decode("utf-16")
    return np.array([float(point) for point in data[:-1].split(";")]).reshape((chip_count, 4, 3))

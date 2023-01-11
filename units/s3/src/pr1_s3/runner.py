import asyncio
import botocore.exceptions
from dataclasses import dataclass
import io
import math
import os
from pathlib import Path
from queue import SimpleQueue
import time
from types import EllipsisType
from typing import Any, Literal, Optional

import boto3
from pr1.fiber.eval import EvalStack
from pr1.fiber.expr import PythonExprContext
from pr1.fiber.process import ProgramExecEvent
from pr1.units.base import BaseProcessRunner
from pr1.util.asyncio import AsyncIteratorThread
from pr1.util.misc import FileObject, UnreachableError

from . import namespace
from .parser import ProcessData


MIN_PART_SIZE = 5_242_880 # 5 MiB


@dataclass
class ProcessLocation:
  paused: bool
  phase: Literal['create', 'upload', 'complete', 'done']
  progress: float

  def export(self):
    return {
      "paused": self.paused,
      "phase": self.phase,
      "progress": self.progress
    }

@dataclass
class ProcessPoint:
  pass

class Process:
  def __init__(self, data: ProcessData, *, runner: 'Runner'):
    self._data = data
    self._runner = runner

  def halt(self):
    pass

  def pause(self):
    pass

  async def run(self, initial_point: Optional[ProcessPoint], *, stack: EvalStack):
    if isinstance(self._data.source, PythonExprContext):
      analysis, source_result = self._data.source.evaluate(stack)

      if isinstance(source_result, EllipsisType):
        # Abort
        print("Abort", analysis)
        return

      source_value = source_result.value
    else:
      source_value = self._data.source

    source_data: FileObject | bytes
    source_file: io.IOBase
    source_size: int

    match source_value:
      case bytes():
        source_data = source_value
        source_file = io.BytesIO(source_value)
        source_size = len(source_value)
      case Path():
        if not source_value.is_absolute():
          source_value = self._runner._chip.dir / source_value

        if not source_value.exists():
          raise Exception("Missing file")

        # TODO: Close file
        try:
          source_data = source_value.open('rb')
        except OSError:
          raise Exception("Error")

        source_file = source_data
        source_size = source_value.stat().st_size
      case FileObject():
        # TODO: Do something else if fileno() does not exist
        source_data = source_value
        source_file = source_value
        source_size = os.fstat(source_value.fileno()).st_size
      case _:
        raise UnreachableError()

    part_size = MIN_PART_SIZE
    part_count = math.floor(source_size / part_size) if self._data.multipart else 1

    print("Count", part_count)

    assert part_count <= 10000

    client = boto3.client(
      aws_access_key_id="...",
      aws_secret_access_key="...",
      # aws_session_token="",
      region_name="eu-central-1",
      service_name="s3"
    )


    # Single upload
    if part_count <= 1:
      yield ProgramExecEvent(
        location=ProcessLocation(
          paused=False,
          phase='upload',
          progress=0.0
        )
      )

      def run_upload(callback):
        return client.upload_fileobj(
          source_file,
          Bucket=self._data.bucket,
          Key=self._data.target,
          Callback=callback
        )

      thread = AsyncIteratorThread[None, int](run_upload)

      uploaded_byte_count = 0

      async for chunk_byte_count in thread:
        uploaded_byte_count += chunk_byte_count

        yield ProgramExecEvent(
          location=ProcessLocation(
            paused=False,
            phase='upload',
            progress=(uploaded_byte_count / source_size)
          )
        )

      try:
        thread.result()
      except botocore.exceptions.ClientError as e:
        print("Client error:", e)

    # Multipart upload
    else:
      yield ProgramExecEvent(
        location=ProcessLocation(
          paused=False,
          phase='create',
          progress=0.0
        )
      )

      loop = asyncio.get_event_loop()
      res_create = await loop.run_in_executor(None, lambda: client.create_multipart_upload(
        Bucket=self._data.bucket,
        Key=self._data.target
      ))

      yield ProgramExecEvent(
        location=ProcessLocation(
          paused=False,
          phase='upload',
          progress=0.0
        )
      )

      parts = list()

      for part_index in range(part_count):
        part_last = part_index == (part_count - 1)

        res_upload = await loop.run_in_executor(None, lambda: client.upload_part(
          Body=source_file.read(-1 if part_last else part_size),
          Bucket=res_create['Bucket'],
          Key=res_create['Key'],
          PartNumber=(part_index + 1),
          UploadId=res_create['UploadId']
        ))

        parts.append(dict(
          ETag=res_upload['ETag'],
          PartNumber=(part_index + 1)
        ))

        yield ProgramExecEvent(
          location=ProcessLocation(
            paused=False,
            phase=('complete' if part_last else 'upload'),
            progress=(part_index / part_count)
          )
        )

      await loop.run_in_executor(None, lambda: client.complete_multipart_upload(
        Bucket=res_create['Bucket'],
        Key=res_create['Key'],
        MultipartUpload=dict(Parts=parts),
        UploadId=res_create['UploadId']
      ))

    yield ProgramExecEvent(
      location=ProcessLocation(
        paused=False,
        phase='complete',
        progress=1.0
      ),
      stopped=True,
      terminated=True
    )


class Runner(BaseProcessRunner):
  Process = Process

  def __init__(self, chip, *, host):
    self._chip = chip

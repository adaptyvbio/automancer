from botocore.config import Config
from dataclasses import dataclass
from pathlib import Path
from types import EllipsisType
from typing import Literal, Optional, Protocol
import asyncio
import botocore.exceptions
import io
import math
import os

import boto3
import pr1 as am
from pr1.error import Diagnostic
from pr1.fiber.eval import EvalStack
from pr1.fiber.expr import export_value
from pr1.fiber.process import BaseProcess, BaseProcessPoint, ProcessExecEvent, ProcessFailureEvent, ProcessTerminationEvent
from pr1.master.analysis import MasterAnalysis, MasterError
from pr1.units.base import BaseProcessRunner
from pr1.util.asyncio import AsyncIteratorThread
from pr1.util.misc import FileObject, UnreachableError

from . import namespace


MIN_PART_SIZE = 5_242_880 # 5 MiB


class AWSCredentials(Protocol):
  access_key_id: str
  secret_access_key: str
  session_token: Optional[str]

class ProcessData(Protocol):
  bucket: str
  credentials: Optional[AWSCredentials]
  multipart: bool
  region: str
  source: am.FileRef
  target: str


class BotoError(MasterError):
  def __init__(self, exception: Exception, /):
    super().__init__(exception.args[0])

class SourceError(MasterError):
  def __init__(self, exception: OSError, /):
    super().__init__(str(exception))


@dataclass(kw_only=True)
class ProcessLocation:
  paused: bool = False
  phase: Literal['complete', 'create', 'done', 'part_upload', 'upload']
  progress: float

  def export(self):
    return {
      "paused": self.paused,
      "phase": self.phase,
      "progress": self.progress
    }

@dataclass(kw_only=True)
class ProcessPoint(BaseProcessPoint):
  pass

class Process(BaseProcess[ProcessData, ProcessPoint]):
  name = "_"
  namespace = namespace

  def __init__(self, data: ProcessData, /, master):
    self._data = data

  async def run(self, point, stack):
    try:
      with self._data.source.open("rb") as source_file:
        source_size = self._data.source.get_size()

        part_size = MIN_PART_SIZE
        part_count = math.floor(source_size / part_size) if self._data.multipart else 1

        assert part_count <= 10000

        config = Config(
          retries=dict(
            mode='standard'
          )
        )

        client_args = dict(
          config=config,
          region_name=self._data.region,
          service_name="s3"
        )

        if (credentials := self._data.credentials):
          client_args |= dict(
            aws_access_key_id=credentials.access_key_id,
            aws_secret_access_key=credentials.secret_access_key,
            aws_session_token=credentials.session_token
          )

        client = boto3.client(**client_args)


        # Single upload
        if part_count <= 1:
          yield ProcessExecEvent(
            location=ProcessLocation(
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

            yield ProcessExecEvent(
              location=ProcessLocation(
                phase='upload',
                progress=(uploaded_byte_count / source_size)
              )
            )

          try:
            thread.result()
          except (botocore.exceptions.BotoCoreError, botocore.exceptions.ClientError) as e:
            yield ProcessFailureEvent(
              analysis=MasterAnalysis(errors=[BotoError(e)])
            )

            return
    except OSError as e:
      yield ProcessFailureEvent(
        analysis=MasterAnalysis(errors=[SourceError(e)])
      )

      return

    # # Multipart upload
    # else:
    #   yield ProcessExecEvent(
    #     pausable=True,
    #     location=ProcessLocation(
    #       phase='create',
    #       progress=0.0
    #     )
    #   )

    #   loop = asyncio.get_event_loop()
    #   res_create = await loop.run_in_executor(None, lambda: client.create_multipart_upload(
    #     Bucket=self._data.bucket,
    #     Key=self._data.target
    #   ))

    #   upload_args = dict(
    #     Bucket=res_create['Bucket'],
    #     Key=res_create['Key'],
    #     UploadId=res_create['UploadId']
    #   )

    #   try:
    #     if self._halted:
    #       raise asyncio.CancelledError

    #     if self._resume_future:
    #       yield ProcessExecEvent(
    #         location=ProcessLocation(
    #           paused=True,
    #           phase='part_upload',
    #           progress=0.0
    #         ),
    #         stopped=True
    #       )

    #       await self._resume_future

    #     yield ProcessExecEvent(
    #       pausable=True,
    #       location=ProcessLocation(
    #         phase='part_upload',
    #         progress=0.0
    #       )
    #     )

    #     parts = list()

    #     for part_index in range(part_count):
    #       part_last = part_index == (part_count - 1)

    #       res_upload = await loop.run_in_executor(None, lambda: client.upload_part(
    #         Body=source_file.read(-1 if part_last else part_size),
    #         PartNumber=(part_index + 1),
    #         **upload_args
    #       ))

    #       parts.append(dict(
    #         ETag=res_upload['ETag'],
    #         PartNumber=(part_index + 1)
    #       ))

    #       if self._halted:
    #         raise asyncio.CancelledError()

    #       location = ProcessLocation(
    #         phase=('complete' if part_last else 'part_upload'),
    #         progress=((part_index + 1) / part_count)
    #       )

    #       if self._resume_future:
    #         yield ProcessExecEvent(
    #           location=ProcessLocation(
    #             paused=True,
    #             phase=location.phase,
    #             progress=location.progress
    #           ),
    #           stopped=True
    #         )

    #         await self._resume_future

    #       yield ProcessExecEvent(
    #         location=location
    #       )

    #     await loop.run_in_executor(None, lambda: client.complete_multipart_upload(
    #       MultipartUpload=dict(Parts=parts),
    #       **upload_args
    #     ))
    #   except asyncio.CancelledError:
    #     pass
    #   finally:
    #     await loop.run_in_executor(None, lambda: client.abort_multipart_upload(
    #       **upload_args
    #     ))

    # client.close()

    yield ProcessTerminationEvent(
      location=ProcessLocation(
        paused=False,
        phase='done',
        progress=1.0
      )
    )

  @staticmethod
  def export_data(data):
    return {
      "bucket": export_value(data['bucket']),
      "multipart": export_value(data['multipart']),
      "target": export_value(data['target'])
    }

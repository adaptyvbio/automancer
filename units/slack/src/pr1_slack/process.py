import asyncio
from logging import Logger
import math
from asyncio import Event
from dataclasses import dataclass
from typing import Literal, Optional, Protocol

import pr1 as am
from pr1.fiber.expr import export_value
from pr1.fiber.process import (BaseProcess, BaseProcessPoint, ProcessExecEvent,
                               ProcessFailureEvent, ProcessPauseEvent, ProcessTerminationEvent)
from pr1.master.analysis import MasterAnalysis, MasterError
from pr1.util.asyncio import AsyncIteratorThread
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

from . import logger, namespace


class SlackFile(Protocol):
  contents: am.FileRef
  format: Optional[str]
  name: Optional[str]

class SlackSettings(Protocol):
  channel_id: str
  icon_url: Optional[str]
  token: str
  user_name: str

class ProcessData(Protocol):
  body: str
  files: list[SlackFile]
  settings: SlackSettings


class SlackError(MasterError):
  def __init__(self, exception: Exception, /):
    super().__init__(exception.args[0])

class SourceError(MasterError):
  def __init__(self, exception: OSError, /):
    super().__init__(str(exception))


@dataclass(kw_only=True)
class ProcessLocation:
  file_count: int
  phase: int

  def export(self):
    return {
      "fileCount": self.file_count,
      "phase": self.phase
    }

@dataclass(kw_only=True)
class ProcessPoint(BaseProcessPoint):
  pass

@am.provide_logger(logger)
class Process(BaseProcess[ProcessData, ProcessPoint]):
  name = "_"
  namespace = namespace

  def __init__(self, data: ProcessData, /, master):
    self._data = data
    self._halted = False
    self._resume_event: Optional[Event] = None

    self._logger: Logger

  async def run(self, point, stack):
    client = WebClient(token=self._data.settings.token)
    phase = 0

    def create_location():
      return ProcessLocation(
        file_count=len(self._data.files),
        phase=phase
      )

    yield ProcessExecEvent(
      location=create_location()
    )

    try:
      result = await asyncio.to_thread(lambda: client.chat_postMessage(
        channel=self._data.settings.channel_id,
        text=self._data.body
      ))

      phase += 1

      for data_file in self._data.files:
        with data_file.contents.open("r") as file:
          result = await asyncio.to_thread(lambda: client.files_upload(
            channels=self._data.settings.channel_id,
            file=file,
            filename=data_file.name,
            filetype=data_file.format # To be standardized
          ))

          print(result)

        phase += 1
    except SlackApiError as e:
      yield ProcessFailureEvent(
        analysis=MasterAnalysis(errors=[SlackError(e)]),
        location=create_location()
      )
    else:
      yield ProcessTerminationEvent(
        # analysis=MasterAnalysis(effects=[Effect(...)]),
        location=create_location()
      )

  @staticmethod
  def export_data(data):
    return {
      "body": export_value(data['body'])
    }

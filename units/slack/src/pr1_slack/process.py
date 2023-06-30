import asyncio
from dataclasses import dataclass
from typing import Any, Optional, Protocol

import pr1 as am
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

from . import namespace


class SlackFile(Protocol):
  contents: am.DataRef
  format: Optional[str]
  name: Optional[str]

class SlackSettings(Protocol):
  channel_id: str
  icon_url: Optional[str]
  token: str
  user_name: Optional[str]

class ProcessData(Protocol):
  body: str
  files: list[SlackFile]
  settings: SlackSettings


@dataclass(frozen=True, kw_only=True, slots=True)
class ProcessLocation:
  body: str
  file_count: int
  phase: int

  def export(self):
    return {
      "body": self.body,
      "fileCount": self.file_count,
      "phase": self.phase
    }

@dataclass(kw_only=True)
class ProcessPoint(am.BaseProcessPoint):
  pass

class Process(am.BaseClassProcess[ProcessData, ProcessLocation, ProcessPoint]):
  name = "_"
  namespace = namespace

  def duration(self, data):
    return am.DurationTerm(5.0)

  def export_data(self, data):
    return {
      "body": "" # TODO: Fill in with something like export_value(data.get("body"))
    }

  async def __call__(self, context: am.ProcessContext[ProcessData, ProcessLocation, ProcessPoint]):
    client = WebClient(token=context.data.settings.token)
    phase = 0

    def send_location():
      context.send_location(ProcessLocation(
        body=context.data.body,
        file_count=len(context.data.files),
        phase=phase
      ))

    send_location()

    try:
      response = await asyncio.to_thread(lambda: client.chat_postMessage(
        channel=context.data.settings.channel_id,
        text=context.data.body,
        username=context.data.settings.user_name
      ))

      phase += 1
      send_location()

      for data_file in context.data.files:
        with data_file.contents.open(text=False) as file:
          # TODO: Test what happends when data_file.name is None

          response: Any = await asyncio.to_thread(lambda: client.files_upload(
            channels=context.data.settings.channel_id,
            file=file,
            filename=data_file.name,
            filetype=data_file.format # TODO: Standardize
          ))

          context.send_effect(am.GenericEffect(
            "Uploaded file to Slack",
            description=am.RichText("Uploaded file ", am.RichTextLink(response['file']['title'], url=response['file']['permalink'])),
            icon="upload_file"
          ))

        phase += 1
        send_location()
    except SlackApiError as e:
      raise am.ProcessFailureError from e


process = Process()

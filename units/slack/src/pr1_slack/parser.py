import pr1 as am
from pr1.fiber.parser import BaseParser, ProcessTransformer

from . import namespace
from .process import Process


class Parser(BaseParser):
  namespace = namespace

  def __init__(self, fiber):
    super().__init__(fiber)

    self.transformers = [ProcessTransformer(Process, {
      'slack_send': am.Attribute(
        description="Sends a message to a Slack channel.",
        type=am.EvaluableContainerType(
          am.RecordType({
            'body': am.Attribute(
              am.PotentialExprType(am.StrType()),
              description="The message body."
            ),
            'files': am.Attribute(
              am.ListType(
                am.RecordType({
                  'contents': am.Attribute(
                    am.ReadableDataRefType(),
                    description="The file content.",
                  ),
                  'format': am.Attribute(
                    am.PotentialExprType(am.StrType()),
                    default=None,
                    description="The file format, such as `png`. Defaults to automatic detection."
                  ),
                  'name': am.Attribute(
                    am.PotentialExprType(am.StrType()),
                    default=None,
                    description="The file name. Optional."
                  )
                })
              ),
              default=list(),
              description="A list of files to attach to the message."
            ),
            'settings': am.RecordType({
              'channel_id': am.Attribute(
                am.PotentialExprType(am.StrType()),
                description="The Slack channel id, such as `C04NP6J8EMV`."
              ),
              'icon_url': am.Attribute(
                am.PotentialExprType(am.StrType()),
                description="The URL of the icon to use for the message.",
                default=None
              ),
              'token': am.Attribute(
                am.PotentialExprType(am.StrType()),
                description="The Slack API token."
              ),
              'user_name': am.Attribute(
                am.PotentialExprType(am.StrType()),
                description="The name of the user sending the message."
              )
            })
          }),
          depth=2
        )
      )
    }, parser=fiber)]

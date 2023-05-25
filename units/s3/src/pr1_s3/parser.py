import pr1 as am
from pr1.fiber.parser import BaseParser, ProcessTransformer

from . import namespace
from .process import Process


class Parser(BaseParser):
  namespace = namespace

  def __init__(self, fiber):
    super().__init__(fiber)

    self.transformers = [ProcessTransformer(Process, {
      's3-upload': am.Attribute(
        description="Uploads a file to an S3 bucket.",
        type=am.EvaluableContainerType(
          am.RecordType({
          'bucket': am.Attribute(
            am.PotentialExprType(am.StrType()),
            description="The name of the S3 bucket."
          ),
          'credentials': am.Attribute(
            am.RecordType({
              'access_key_id': am.StrType(),
              'secret_access_key': am.StrType(),
              'session_token': am.Attribute(am.StrType(), optional=True)
            }),
            default=None,
            description="The AWS credentials.",
            documentation=["Defaults to data in ~/.aws/credentials which is automatically written when running `aws configure` with the AWS CLI."]
          ),
          'multipart': am.Attribute(
            am.PotentialExprType(am.BoolType()),
            default=False,
            description="Whether to use a multipart upload. Defaults to `False`."
          ),
          'region': am.Attribute(
            am.PotentialExprType(am.StrType()),
            description="The name of the AWS region, such as `us-east-1`."
          ),
          'source': am.Attribute(
            am.PotentialExprType(
              am.ReadableDataRefType(text=False)
            ),
            description="The source of the data to upload. This can be a path as a literal string, a `Path` instance, a file object or a `bytes` object."
          ),
          'target': am.Attribute(
            am.PotentialExprType(am.StrType()),
            description="The path of the target location on the bucket (object key), such as `path/to/file.ext`."
          )
        }), depth=2)
      )
    }, parser=fiber)]

from dataclasses import dataclass
from pathlib import Path
from types import EllipsisType
from typing import Optional

from pr1.fiber.expr import PythonExpr, PythonExprContext
from pr1.fiber.segment import SegmentTransform
from pr1.fiber.eval import EvalEnvs, EvalStack
from pr1.fiber import langservice as lang
from pr1.fiber.parser import BaseParser, BlockAttrs, BlockData, BlockUnitData, BlockUnitState
from pr1.draft import DraftGenericError
from pr1.util.decorators import debug


@dataclass
class ProcessData:
  bucket: str
  multipart: bool
  source: PythonExprContext | Path | bytes
  target: str

  def export(self):
    return {
      "type": "upload"
    }

class Parser(BaseParser):
  namespace = "s3"

  root_attributes = dict()
  segment_attributes = {
    's3.upload': lang.Attribute(
      description="Uploads a file to an S3 bucket.",
      optional=True,
      type=lang.DictType({
        'bucket': lang.Attribute(
          lang.StrType(),
          description="The name of the S3 bucket."
          # description="The name of the AWS region, such as `us-east-1`"
        ),
        'multipart': lang.Attribute(
          lang.PrimitiveType(bool),
          description="Whether to use a multipart upload.",
          optional=True
        ),
        'source': lang.Attribute(
          lang.LiteralOrExprType(
            lang.DataRefType(text=False),
            dynamic=True
          ),
          description="The source of the data to upload. This can be a path as a literal string, a `Path` instance, a file object or a `bytes` object."
        ),
        'target': lang.Attribute(
          # lang.LiteralOrExprType(lang.PrimitiveType(str), dynamic=True),
          lang.StrType(),
          description="The path of the target location on the bucket (object key), such as `path/to/file.ext`."
        )
      })
    )
  }

  def __init__(self, fiber):
    self._fiber = fiber

  def parse_block(self, block_attrs, /, adoption_envs, adoption_stack, runtime_envs):
    attrs = block_attrs[self.namespace]

    if (value := attrs.get('s3.upload')):
      if isinstance(value, EllipsisType):
        return lang.Analysis(), Ellipsis

      return lang.Analysis(), BlockUnitData(transforms=[SegmentTransform(self.namespace, ProcessData(
        bucket=value['bucket'].value,
        multipart=(value['multipart'].value if 'multipart' in value else True),
        source=(value['source'].value.contextualize(runtime_envs) if isinstance(value['source'].value, PythonExpr) else value['source'].value),
        target=value['target'].value
      ))])
    else:
      return lang.Analysis(), BlockUnitData()

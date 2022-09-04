from . import langservice as lang
from .. import reader
from ..util import schema as sc


class AcmeParser:
  namespace = "acme"

  root_attributes = {
    'value': lang.Attribute(label="Value", description=["`acme.value`", "The value for the acme device."], type=int)
  }


class FiberParser:
  def __init__(self, text, *, host, parsers):
    self._parsers = [Parser() for Parser in [AcmeParser]]


    self.analysis = lang.Analysis()

    data, reader_errors, reader_warnings = reader.loads(text)

    self.analysis.errors += reader_errors
    self.analysis.warnings += reader_warnings

    schema = lang.Dict({
      'name': lang.Attribute(
        label="Protocol name",
        description=["`name`", "The protocol's name."],
        optional=True,
        type=str
      ),
      'value': lang.Attribute(label="Builtin value", type=str)
    }, foldable=True)

    for parser in self._parsers:
      schema.add(parser.root_attributes, namespace=parser.namespace)

    from pprint import pprint
    # pprint(schema._attributes)
    # print(schema.get_attr("name")._label)

    self.analysis += schema.analyze(data)

    # print(reader.LocationArea([analysis.folds[0].range]).format())


if __name__ == "__main__":
  p = FiberParser("""
name: Foobar
value: 16
acme.value: 32
""")

class Draft:
  def __init__(self, *, id, errors, protocol, source, warnings):
    self.id = id
    self.errors = errors
    self.protocol = protocol
    self.source = source
    self.warnings = warnings

  def export(self):
    return {
      "diagnostics": [
        *[{ "kind": "error", **error.diagnostic().export() } for error in self.errors],
        *[{ "kind": "warning", **warning.diagnostic().export() } for warning in self.warnings]
      ],
      "protocol": self.protocol.export(),
      "valid": self.protocol.valid
    }


class DraftDiagnostic:
  def __init__(self, message, *, ranges = list()):
    self.message = message
    self.ranges = ranges

  def export(self):
    return {
      "message": self.message,
      "ranges": [[range.start, range.end] for range in self.ranges]
    }

class DraftGenericError:
  def __init__(self, message, *, ranges = list()):
    self.message = message
    self.ranges = ranges

  def diagnostic(self):
    return DraftDiagnostic(self.message, ranges=self.ranges)

class Draft:
  def __init__(self, *, id, analysis, protocol):
    self.analysis = analysis
    self.id = id
    self.protocol = protocol

  def export(self):
    return {
      "completions": [completion.export() for completion in self.analysis.completions],
      "diagnostics": [
        *[{ "kind": "error", **error.diagnostic().export() } for error in self.analysis.errors],
        *[{ "kind": "warning", **warning.diagnostic().export() } for warning in self.analysis.warnings]
      ],
      "folds": [fold.export() for fold in self.analysis.folds],
      "hovers": [hover.export() for hover in self.analysis.hovers],
      "selections": [selection.export() for selection in self.analysis.selections],

      "protocol": self.protocol.export() if self.protocol else None,
      "valid": not self.analysis.errors
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

from .models import control
from .models.timer import parser as timer
from .protocol import LocatedError, Protocol

from pathlib import Path
from pprint import pprint

try:
  p = Protocol(Path("../test.yml").resolve(), parsers={ "control": control.Parser, "timer": timer.Parser })

  pprint(p.stages)
  pprint(p.segments)
except LocatedError as e:
  print(e)
  e.display()

import logging

namespace = "local_notification"
logger = logging.getLogger("pr1.units." + namespace)
version = "0"

from .executor import Executor
from .parser import Parser
from .runner import Runner

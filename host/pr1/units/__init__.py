from . import builtin, control, input, timer


units = {
  unit.namespace: unit for unit in [builtin, control, input, timer]
}

__all__ = ["units"]

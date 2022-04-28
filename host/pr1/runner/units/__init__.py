from . import control, timer


units = {
  unit.namespace: unit for unit in [control, timer]
}

__all__ = ["units"]

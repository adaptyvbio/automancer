from . import control, timer


models = {
  model.namespace: model for model in [control, timer]
}

__all__ = ["models"]
